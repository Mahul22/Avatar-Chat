<template>
  <div class="chat-window">
    <div class="messages" ref="messagesRef">
      <div v-for="(msg, i) in messages" :key="i" :class="['message-row', msg.sender === 'user' ? 'outgoing' : 'incoming']">
        <img v-if="msg.avatar" :src="getAvatarUrl(msg.avatar)" class="avatar" alt="avatar" />
        <div class="bubble">
          <div class="sender">{{ msg.sender === 'user' ? 'You' : (msg.personaLabel || 'Other') }}</div>
          <div class="text">{{ msg.text }}</div>
          <div class="meta">{{ formatTime(msg.time) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, toRef } from 'vue';
import { io } from 'socket.io-client';

// Use the current host if running from the same server, otherwise use localhost:3001
const socketUrl = window.location.hostname === 'localhost' && window.location.port === '3001' 
  ? 'http://localhost:3001' 
  : 'http://localhost:3001';

// create socket with persona query so server can be aware (useful for future filtering)
const socket = (typeof io === 'function') ? io(socketUrl) : null;
const props = defineProps({ persona: { type: String, default: 'dr_gupta' }, useLlm: { type: Boolean, default: false }, useMedicalConsent: { type: Boolean, default: false } });
const messages = ref([]);
const messagesRef = ref(null);
const currentPersona = ref(props.persona || 'dr_gupta');

const scrollToBottom = () => {
  nextTick(() => {
    const el = messagesRef.value;
    if(el) el.scrollTop = el.scrollHeight;
  });
};

const formatTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
};

const getAvatarUrl = (avatarPath) => {
  // If running from the backend server (port 3001), use relative path
  if (window.location.port === '3001') {
    return avatarPath;
  }
  // Otherwise, use the backend server URL
  return 'http://localhost:3001' + avatarPath;
};

socket.on('connect', () => {
  console.log('[ChatWindow] socket connected', socket.id);
  // inform server of initial LLM preference for this socket
  try { socket.emit('setLLM', !!props.useLlm); } catch(e){}
  // inform server about any initial medical consent if provided via prop
  try { socket.emit('setMedicalConsent', !!props.useMedicalConsent); } catch(e){}
});
socket.on('connect_error', (err) => {
  console.error('[ChatWindow] socket connect_error', err);
});
socket.on('chatHistory', (history) => {
  // Filter history to only include messages for the current persona (avoid showing other personas)
  const filtered = (history || []).filter(m => {
    // include messages that either don't have persona (legacy) or match our current persona
    if(!m.persona) return false;
    return m.persona === currentPersona.value;
  });
  messages.value = filtered;
  scrollToBottom();
});

socket.on('message', (msg) => {
  // If this is a user message, try to reconcile with a pending local message
  if (msg.sender === 'user') {
    const idx = messages.value.findIndex(m => m.pending && m.text === msg.text);
    if (idx !== -1) {
      // replace the pending local message with server message
      messages.value.splice(idx, 1, msg);
      scrollToBottom();
      return;
    }
  }
  messages.value.push(msg);
    console.log('[ChatWindow] received message:', msg);
  scrollToBottom();
});

// Listen to window event dispatched from App.vue when PredictiveInput sends
window.addEventListener('sendMessageFromApp', (e) => {
  const payload = (e && e.detail) ? e.detail : null;
  const text = payload && payload.text ? payload.text : '';
  const persona = payload && payload.persona ? payload.persona : currentPersona.value;
  if (text && text.trim()) {
    // locally push a pending message for immediate feedback
    const localMsg = {
      sender: 'user',
      text: text,
      avatar: '/avatar.jpg',
      persona: persona,
      time: new Date().toISOString(),
      pending: true
    };
    messages.value.push(localMsg);
    scrollToBottom();
    // emit to server with persona info
    console.log('[ChatWindow] emitting newMessage to server:', text, 'persona:', persona);
    socket.emit('newMessage', { text, persona });
  }
});

// Listen for persona changes from App.vue
window.addEventListener('personaChanged', (e) => {
  const id = e && e.detail ? e.detail : null;
  if (id) {
    currentPersona.value = id;
    console.log('[ChatWindow] persona changed to', id);
  }
});

// listen for preference event from App.vue and forward to server
window.addEventListener('llmPreference', (e) => {
  const val = e && typeof e.detail !== 'undefined' ? !!e.detail : false;
  console.log('[ChatWindow] received llmPreference', val);
  try { socket && socket.emit('setLLM', val); } catch(err) {}
});

window.addEventListener('medicalConsent', (e) => {
  const val = e && typeof e.detail !== 'undefined' ? !!e.detail : false;
  console.log('[ChatWindow] received medicalConsent', val);
  try { socket && socket.emit('setMedicalConsent', val); } catch(err) {}
});

watch(messages, scrollToBottom);
</script>

<style scoped>
.chat-window { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  background: linear-gradient(180deg, rgba(20, 20, 20, 0.9) 0%, rgba(0, 0, 0, 0.95) 100%);
  padding: 24px; 
  overflow: hidden;
}

.messages { 
  flex: 1; 
  overflow-y: auto; 
  display: flex; 
  flex-direction: column; 
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: #e50914 transparent;
}

.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: #e50914;
  border-radius: 10px;
}

.message-row { 
  display: flex; 
  align-items: flex-start; 
  animation: fadeInUp 0.4s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-row.incoming { 
  justify-content: flex-start; 
  gap: 12px; 
}

.message-row.outgoing { 
  justify-content: flex-end; 
  gap: 12px; 
}

.avatar { 
  width: 44px; 
  height: 44px; 
  border-radius: 12px; 
  object-fit: cover;
  border: 2px solid rgba(229, 9, 20, 0.3);
  flex-shrink: 0;
}

.bubble { 
  max-width: 70%; 
  padding: 16px 20px; 
  border-radius: 16px; 
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #ffffff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.sender {
  font-size: 11px;
  color: rgba(255,255,255,0.8);
  font-weight: 600;
  margin-bottom: 6px;
  letter-spacing: 0.6px;
}

.bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.message-row.outgoing .bubble { 
  background: linear-gradient(135deg, #e50914 0%, #b81d24 100%);
  border: 1px solid rgba(229, 9, 20, 0.3);
  box-shadow: 0 8px 32px rgba(229, 9, 20, 0.2);
}

.message-row.outgoing .avatar { 
  order: 2;
  border-color: rgba(229, 9, 20, 0.5);
}

.meta { 
  font-size: 11px; 
  color: rgba(255, 255, 255, 0.6); 
  margin-top: 8px; 
  text-align: right;
  font-weight: 300;
  letter-spacing: 0.5px;
}

.message-row.incoming .meta {
  text-align: left;
}

.text { 
  white-space: pre-wrap;
  line-height: 1.5;
  font-weight: 400;
  font-size: 14px;
}
</style>
