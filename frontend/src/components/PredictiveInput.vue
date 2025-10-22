<template>
  <div class="netflix-input-bar">
    <div class="input-container">
      <input 
        type="text" 
        v-model="text" 
        @input="onInput" 
        @keydown.enter.prevent="emitSend" 
        placeholder="Start your conversation..." 
        class="netflix-input"
      />
      <div class="input-glow"></div>
    </div>
    <button class="netflix-send-btn" @click="emitSend">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({ modelValue: String });
const emit = defineEmits(['update:modelValue', 'send']);

const text = ref(props.modelValue || '');

watch(() => props.modelValue, (val) => { text.value = val || ''; });

const onInput = () => {
  emit('update:modelValue', text.value);
};

const emitSend = () => {
  const trimmed = (text.value || '').trim();
  if(!trimmed) return;
  emit('send', trimmed);
  emit('update:modelValue', '');
  text.value = '';
};
</script>

<style scoped>
.netflix-input-bar { 
  display: flex; 
  gap: 16px; 
  align-items: center;
  padding: 4px;
}

.input-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
}

.netflix-input { 
  width: 100%;
  padding: 16px 20px; 
  border-radius: 12px; 
  border: 2px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  color: #ffffff;
  font-size: 16px;
  font-family: inherit;
  font-weight: 400;
  letter-spacing: 0.5px;
  transition: all 0.3s ease;
  outline: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.netflix-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.netflix-input:focus {
  border-color: #e50914;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.2), 0 8px 30px rgba(0, 0, 0, 0.3);
  transform: translateY(-1px);
}

.input-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(229, 9, 20, 0.2), transparent);
  transition: left 0.5s ease;
  pointer-events: none;
}

.netflix-input:focus + .input-glow {
  left: 100%;
}

.netflix-send-btn { 
  background: linear-gradient(135deg, #e50914 0%, #b81d24 100%);
  color: white; 
  border: none; 
  padding: 16px; 
  border-radius: 12px; 
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(229, 9, 20, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 52px;
}

.netflix-send-btn:hover {
  background: linear-gradient(135deg, #f40612 0%, #d01e2a 100%);
  box-shadow: 0 6px 25px rgba(229, 9, 20, 0.4);
  transform: translateY(-2px);
}

.netflix-send-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 15px rgba(229, 9, 20, 0.3);
}

.netflix-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
</style>
