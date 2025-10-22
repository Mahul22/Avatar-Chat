<template>
  <div id="app" class="app-root">
    <div class="netflix-container">
      <header class="netflix-header">
        <div class="netflix-logo">
          <span class="logo-text">AVATAR</span>
          <span class="logo-subtitle">CHAT</span>
        </div>
        <div class="header-controls">
          <!-- profile avatar removed as requested -->
        </div>
      </header>

        <!-- Show selection screen until the user chooses a persona -->
        <div v-if="!personaChosen" class="persona-screen">
          <h2 class="persona-title">Choose who you'd like to talk to</h2>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-bottom:8px;max-width:760px;text-align:center;">You can enable the language model for richer, more open-ended replies. Enabling sends your messages to the model provider (OpenAI) — don't share sensitive personal data unless you consent.</div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <input type="checkbox" v-model="useLlm" />
            <span style="font-size:13px;color:rgba(255,255,255,0.9);">Enable LLM (OpenAI) — I consent to sending my chat to the model</span>
          </label>
          <!-- medical consent (required only if Dr. Gupta + LLM) -->
          <label v-if="useLlm" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;max-width:760px;">
            <input type="checkbox" v-model="medicalConsent" />
            <div style="font-size:13px;color:rgba(255,255,255,0.9);">I consent to share medical information with the model for medical consultation with Dr. Gupta. I understand this is informational and not a substitute for professional care.</div>
          </label>
          <div class="persona-grid">
            <div v-for="p in personas" :key="p.id" class="persona-card" @click="choosePersona(p.id)">
              <img :src="p.img" class="persona-img" :alt="p.label" />
              <div class="persona-name">{{ p.label }}</div>
              <div class="persona-desc">{{ p.description }}</div>
            </div>
          </div>
        </div>

  <ChatWindow v-else :persona="selectedPersona" :use-llm="useLlm" :use-medical-consent="medicalConsent" />

      <!-- show input/footer only after persona chosen -->
      <footer class="netflix-footer" v-if="personaChosen">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img :src="(personas.find(p=>p.id===selectedPersona)||{}).img" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:2px solid rgba(255,255,255,0.12);" />
            <div>
              <div style="font-weight:700">{{ (personas.find(p=>p.id===selectedPersona)||{}).label }}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.7)">{{ (personas.find(p=>p.id===selectedPersona)||{}).description }}</div>
            </div>
          </div>
          <div>
            <button class="persona-btn" @click="personaChosen = false">Change</button>
          </div>
        </div>
        <PredictiveInput v-model="inputMessage" @send="onSend" />
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { onMounted } from 'vue';
import ChatWindow from './components/ChatWindow.vue';
import PredictiveInput from './components/PredictiveInput.vue';

const inputMessage = ref('');

// Define available personas with labels and images served from backend/public
const personas = [
  { id: 'dr_gupta', label: 'Dr. Gupta', img: '/avatar3.jpg', description: 'Medical consultation' },
  { id: 'zoya', label: 'Zoya', img: '/avatar4.jpg', description: 'Compassionate companion' },
  { id: 'robin', label: 'Robin', img: '/avatar5.jpg', description: 'Emergency helper' },
  { id: 'rabindr', label: 'Rabindr', img: '/avatar.jpg', description: 'Poetic discussion' }
];

const selectedPersona = ref(personas[0].id);
const personaChosen = ref(false);
const useLlm = ref(false);
const medicalConsent = ref(false);

function selectPersona(id) {
  // legacy click from inline selector (kept for compatibility)
  selectedPersona.value = id;
  window.dispatchEvent(new CustomEvent('personaChanged', { detail: id }));
}

function choosePersona(id) {
  // If user chose Dr. Gupta and LLM is enabled, require medical consent
  if (id === 'dr_gupta' && useLlm.value && !medicalConsent.value) {
    alert('Medical consent is required to enable the language model for medical consultation. Please check the consent box.');
    return;
  }
  selectedPersona.value = id;
  personaChosen.value = true;
  // notify ChatWindow & other listeners
  window.dispatchEvent(new CustomEvent('personaChanged', { detail: id }));
  // also notify server/client about LLM preference and medical consent
  window.dispatchEvent(new CustomEvent('llmPreference', { detail: !!useLlm.value }));
  window.dispatchEvent(new CustomEvent('medicalConsent', { detail: !!medicalConsent.value }));
}

onMounted(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('persona');
    const llm = params.get('useLlm');
    if (p && personas.find(x => x.id === p)) {
      useLlm.value = llm === '1' || llm === 'true';
      // small delay to allow listeners to attach
      setTimeout(() => choosePersona(p), 50);
    }
  } catch (err) { console.warn('Error reading URL params', err); }
});

function onSend(msg) {
  // emit an event to ChatWindow via a simple window event (quick approach without a store)
  window.dispatchEvent(new CustomEvent('sendMessageFromApp', { detail: { text: msg, persona: selectedPersona.value } }));
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Netflix+Sans:wght@300;400;500;700;900&display=swap');

.app-root { 
  font-family: 'Netflix Sans', 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #141414 0%, #000000 100%);
  min-height: 100vh;
  color: #ffffff;
}

.netflix-container { 
  width: 100%; 
  max-width: 900px; 
  height: 100vh; 
  margin: 0 auto; 
  display: flex; 
  flex-direction: column; 
  background: rgba(20, 20, 20, 0.95);
  backdrop-filter: blur(10px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.netflix-header { 
  background: linear-gradient(90deg, #e50914 0%, #b81d24 100%);
  color: #ffffff; 
  padding: 20px 24px; 
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 20px rgba(229, 9, 20, 0.3);
}

.netflix-logo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.logo-text { 
  font-weight: 900; 
  font-size: 28px;
  letter-spacing: 2px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.logo-subtitle {
  font-weight: 300;
  font-size: 12px;
  letter-spacing: 4px;
  opacity: 0.9;
  margin-top: -4px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-profile {
  display: flex;
  align-items: center;
}

.profile-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  object-fit: cover;
  transition: transform 0.3s ease;
}

.profile-avatar:hover {
  transform: scale(1.1);
  border-color: rgba(255, 255, 255, 0.6);
}

.netflix-footer { 
  padding: 20px 24px; 
  background: rgba(20, 20, 20, 0.8);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.persona-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
}
.persona-btn.active {
  background: linear-gradient(135deg, #e50914 0%, #b81d24 100%);
  box-shadow: 0 8px 24px rgba(229,9,20,0.25);
  border-color: rgba(229,9,20,0.6);
}

.persona-screen {
  padding: 28px 24px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:18px;
}
.persona-title {
  margin:0;
  font-size:20px;
  color:#fff;
}
.persona-grid {
  display:grid;
  grid-template-columns:repeat(4, 1fr);
  gap:16px;
  width:100%;
  max-width:760px;
}
.persona-card {
  background: rgba(255,255,255,0.03);
  border-radius:12px;
  padding:16px;
  text-align:center;
  cursor:pointer;
  border:1px solid rgba(255,255,255,0.04);
}
.persona-card:hover { transform: translateY(-6px); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
.persona-img { width:80px; height:80px; border-radius:12px; object-fit:cover; margin-bottom:8px; }
.persona-name { font-weight:700; margin-bottom:6px; }
.persona-desc { font-size:12px; color:rgba(255,255,255,0.7); }
</style>
