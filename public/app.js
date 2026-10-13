const form = document.querySelector('#chat-form');
const input = document.querySelector('#question');
const messagesEl = document.querySelector('#messages');
const modeEl = document.querySelector('#mode');
const suggestions = document.querySelector('#suggestions');
const languagePicker = document.querySelector('#language-switcher');
const voiceButton = document.querySelector('#voice-input');
let history = [];
let busy = false;
let locale = localStorage.getItem('lumident-locale') === 'en' ? 'en' : 'ru';
let dictating = false;
let recorder = null;
let microphoneStream = null;
let audioChunks = [];
let recordingTimer = null;

const text = {
  ru: {
    navServices: 'Услуги', navAbout: 'О клинике', navContacts: 'Контакты', askQuestion: 'Задать вопрос ↗',
    alwaysHere: 'Всегда на связи', heroTitle: 'Забота начинается с разговора', heroText: 'Спросите об услугах, стоимости и материалах. Цифровой администратор LumiDent поможет сориентироваться.', startChat: 'Начать диалог ↗', heroNote: 'Ответим на ваши вопросы в любое время',
    everyDay: 'Каждый день', moscow: 'Москва', address: 'ул. Сиреневая, 18', gentleCare: 'Бережный подход', treatmentPlan: 'План лечения после осмотра', chatKicker: 'ВАШ ВОПРОС — НАШ ОТВЕТ', chatTitle: 'Поговорим о вашей улыбке?', chatSubtitle: 'Узнайте об услугах и ценах клиники.', assistantName: 'Администратор LumiDent', assistantStatus: 'Готов помочь с вашим вопросом', greeting: 'Здравствуйте! Я цифровой администратор LumiDent. Расскажу об услугах и ценах. О чём хотите узнать?', now: 'Сейчас', messageLabel: 'Ваше сообщение', placeholder: 'Напишите ваш вопрос…', voiceLabel: 'Голосовой ввод', sendLabel: 'Отправить сообщение', chatNote: 'Нажмите микрофон один раз, говорите, затем нажмите ещё раз для остановки. Распознавание выполняется локально; перед отправкой проверьте текст.',
    careEveryStep: 'ЗАБОТА НА КАЖДОМ ЭТАПЕ', popularServices: 'Популярные услуги', priceNote: 'Точную стоимость врач определит после осмотра и диагностики.', closingTitle: 'Ваш путь к улыбке начинается с вопроса', writeReception: 'Написать администратору ↗', footerAbout: 'Стоматология с вниманием к каждой улыбке.', contactsTitle: 'Контакты', footerAddress: 'Москва, ул. Сиреневая, 18', footerHours: 'Ежедневно, 09:00–21:00', navigation: 'Навигация', askShort: 'Задать вопрос', footerNote: 'Информация не заменяет очную консультацию врача.',
    serviceAsk: 'Спросить ↗', priceFrom: 'от', noServices: 'Список услуг временно недоступен.', typing: 'Печатает…', modeLive: 'AI-администратор на связи', modeDemo: 'Справочник клиники', modeUnavailable: 'Ассистент временно недоступен', sendError: 'Не удалось получить ответ. Попробуйте ещё раз.', micUnsupported: 'Запись голоса не поддерживается этим браузером.', micDenied: 'Нет доступа к микрофону. Разрешите доступ в настройках браузера.', micNoSpeech: 'Речь не распознана. Говорите после включения микрофона и нажмите ещё раз для остановки.', micNoModel: 'Локальная модель речи не установлена. Выполните pnpm voice:setup и перезапустите сервер.', micNoDevice: 'Микрофон не найден. Проверьте подключение устройства.', micFormat: 'Браузер не смог подготовить запись. Попробуйте ещё раз.', micFailed: 'Локальное распознавание не удалось. Попробуйте ещё раз.', micListening: 'Идёт запись. Нажмите микрофон ещё раз, чтобы остановить.', micProcessing: 'Распознаём локально…', dictating: 'Записываю… нажмите, чтобы остановить', speak: 'Озвучить ответ', speechUnsupported: 'Озвучка не поддерживается этим браузером.',
    servicesMenu: [['Консультация', 'Расскажите о консультации стоматолога'], ['Лечение кариеса', 'Сколько стоит лечение кариеса?'], ['Профессиональная гигиена', 'Сколько стоит профессиональная гигиена?'], ['Имплантация', 'Расскажите об имплантации зуба'], ['Все услуги', 'Какие услуги доступны в LumiDent?']],
    guaranteesMenu: [['Материалы', 'Какие материалы и производителей вы используете?'], ['Гарантии на работы', 'Какие гарантии есть на лечение и работы?'], ['Пломбы', 'Какие материалы вы используете для пломб и какая гарантия?']],
    mainButtons: ['Услуги', 'Гарантия', 'Записаться'], offTopic: 'ГОЛОСОВОЙ ВВОД', back: 'Назад'
  },
  en: {
    navServices: 'Services', navAbout: 'About', navContacts: 'Contacts', askQuestion: 'Ask a question ↗',
    alwaysHere: 'Here to help', heroTitle: 'Care begins with a conversation', heroText: 'Ask about treatments, prices, and materials. The LumiDent digital receptionist can help you find your way.', startChat: 'Start a chat ↗', heroNote: 'Ask us a question any time',
    everyDay: 'Every day', moscow: 'Moscow', address: '18 Sirenevaya St.', gentleCare: 'Gentle care', treatmentPlan: 'Treatment plan after examination', chatKicker: 'YOUR QUESTION — OUR ANSWER', chatTitle: 'Let’s talk about your smile', chatSubtitle: 'Learn about clinic services and prices.', assistantName: 'LumiDent Receptionist', assistantStatus: 'Ready to help with your question', greeting: 'Hello! I’m LumiDent’s digital receptionist. I can tell you about services and prices. What would you like to know?', now: 'Now', messageLabel: 'Your message', placeholder: 'Type your question…', voiceLabel: 'Voice input', sendLabel: 'Send message', chatNote: 'Click the microphone once, speak, then click again to stop. Speech is recognized locally; review the text before sending.',
    careEveryStep: 'CARE AT EVERY STEP', popularServices: 'Popular services', priceNote: 'Your dentist will confirm the exact price after an examination and diagnostics.', closingTitle: 'Your path to a smile starts with a question', writeReception: 'Message the receptionist ↗', footerAbout: 'Dentistry with care for every smile.', contactsTitle: 'Contacts', footerAddress: '18 Sirenevaya St., Moscow', footerHours: 'Daily, 09:00–21:00', navigation: 'Navigation', askShort: 'Ask a question', footerNote: 'Information is not a substitute for an in-person dental consultation.',
    serviceAsk: 'Ask ↗', priceFrom: 'from', noServices: 'The service list is temporarily unavailable.', typing: 'Typing…', modeLive: 'AI receptionist is online', modeDemo: 'Clinic information', modeUnavailable: 'The assistant is temporarily unavailable', sendError: 'I could not get a response. Please try again.', micUnsupported: 'Audio recording is not supported in this browser.', micDenied: 'Microphone access is blocked. Allow it in your browser settings.', micNoSpeech: 'No speech was recognized. Speak after recording starts, then click again to stop.', micNoModel: 'The local speech model is missing. Run pnpm voice:setup and restart the server.', micNoDevice: 'No microphone was found. Check that a device is connected.', micFormat: 'The browser could not prepare the recording. Please try again.', micFailed: 'Local speech recognition failed. Please try again.', micListening: 'Recording. Click the microphone again to stop.', micProcessing: 'Recognizing locally…', dictating: 'Recording… click to stop', speak: 'Read answer aloud', speechUnsupported: 'Speech playback is not supported in this browser.',
    servicesMenu: [['Consultation', 'Tell me about a dental consultation'], ['Cavity treatment', 'How much does cavity treatment cost?'], ['Professional cleaning', 'How much does professional teeth cleaning cost?'], ['Implants', 'Tell me about a dental implant'], ['All services', 'What services does LumiDent offer?']],
    guaranteesMenu: [['Materials', 'Which materials and brands do you use?'], ['Treatment warranties', 'What warranties do you offer for dental work?'], ['Fillings', 'Which filling materials do you use and what is the warranty?']],
    mainButtons: ['Services', 'Warranty', 'Appointments'], offTopic: 'VOICE INPUT', back: 'Back'
  }
};

function applyLanguage() {
  const dictionary = text[locale];
  document.documentElement.lang = locale;
  languagePicker.value = locale;
  document.querySelectorAll('[data-i18n]').forEach(node => { const value = dictionary[node.dataset.i18n]; if (value) node.textContent = value; });
  input.placeholder = dictionary.placeholder;
  input.setAttribute('aria-label', dictionary.messageLabel);
  voiceButton.setAttribute('aria-label', dictating ? dictionary.dictating : dictionary.voiceLabel);
    voiceButton.title = dictating ? dictionary.dictating : dictionary.voiceLabel;
  document.querySelector('#send-message').setAttribute('aria-label', dictionary.sendLabel);
  showMainSuggestions();
  setMode(window.currentMode || 'unavailable');
  loadServices();
}
function makeButton(label, attrs = {}) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  for (const [name, value] of Object.entries(attrs)) button.dataset[name] = value;
  return button;
}
function showMainSuggestions() {
  suggestions.replaceChildren();
  for (const [label, menu] of [[text[locale].mainButtons[0], 'services'], [text[locale].mainButtons[1], 'guarantees']]) suggestions.append(makeButton(label, { menu }));
  suggestions.append(makeButton(text[locale].mainButtons[2], { question: locale === 'en' ? 'I would like to ask about an appointment' : 'Хочу узнать о записи на приём' }));
  suggestions.hidden = false;
}
function showMenu(name) {
  suggestions.replaceChildren();
  for (const [label, question] of text[locale][name === 'services' ? 'servicesMenu' : 'guaranteesMenu']) suggestions.append(makeButton(label, { question }));
  suggestions.append(makeButton(text[locale].back, { back: 'true' }));
  suggestions.hidden = false;
}
function setMode(mode) {
  window.currentMode = mode;
  modeEl.lastChild.textContent = ` ${text[locale][mode === 'live' ? 'modeLive' : mode === 'demo' ? 'modeDemo' : 'modeUnavailable']}`;
}
function speak(content) {
  if (!('speechSynthesis' in window)) { notice(text[locale].speechUnsupported); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = locale === 'en' ? 'en-US' : 'ru-RU';
  const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(locale));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}
function addMessage(role, content, loading = false) {
  const item = document.createElement('div'); item.className = `message ${role === 'user' ? 'user' : 'bot'}${loading ? ' loading' : ''}`;
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = content; item.append(bubble);
  if (role === 'assistant' && !loading) {
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    const audioButton = makeButton('🔊'); audioButton.className = 'speak-btn'; audioButton.setAttribute('aria-label', supported ? text[locale].speak : text[locale].speechUnsupported); audioButton.title = supported ? text[locale].speak : text[locale].speechUnsupported; audioButton.disabled = !supported;
    if (supported) audioButton.addEventListener('click', () => speak(content));
    item.append(audioButton);
  }
  const time = document.createElement('time'); time.textContent = text[locale].now; item.append(time); messagesEl.append(item); messagesEl.scrollTop = messagesEl.scrollHeight;
  return item;
}
function notice(message) { document.querySelector('#notice').textContent = message || ''; }
async function loadServices() {
  const container = document.querySelector('#service-grid');
  try {
    const response = await fetch('/api/knowledge', { cache: 'no-store' }); if (!response.ok) throw new Error('knowledge');
    const data = await response.json(); container.replaceChildren();
    document.querySelector('#clinic-hours').textContent = locale === 'en' ? data.hours_en || data.hours : data.hours;
    for (const service of data.services) {
      const card = document.createElement('article'); card.append(Object.assign(document.createElement('span'), { className: 'service-icon', textContent: '✧' }));
      const title = document.createElement('h3'); title.textContent = locale === 'en' ? service.name_en || service.name : service.name;
      const description = document.createElement('p'); description.textContent = locale === 'en' ? service.description_en || service.description : service.description;
      const bottom = document.createElement('div'); bottom.className = 'service-bottom';
      const price = document.createElement('strong'); price.textContent = service.price_from == null ? (locale === 'en' ? 'Price on request' : 'Цена уточняется') : `${text[locale].priceFrom} ${Number(service.price_from).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU')} ₽`;
      const ask = makeButton(text[locale].serviceAsk, { question: locale === 'en' ? `Tell me about ${service.name_en || service.name}` : `Расскажите об услуге «${service.name}»` });
      bottom.append(price, ask); card.append(title, description, bottom); container.append(card);
    }
  } catch { container.replaceChildren(Object.assign(document.createElement('p'), { textContent: text[locale].noServices })); }
}
async function send(message) {
  const value = message.trim(); if (busy || !value) return;
  busy = true; input.value = ''; input.disabled = true; form.querySelector('#send-message').disabled = true; suggestions.hidden = true;
  addMessage('user', value); history.push({ role: 'user', content: value });
  const loading = addMessage('assistant', text[locale].typing, true);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-25), locale }) });
    const result = await response.json(); loading.remove();
    if (!response.ok) throw new Error(result.error || text[locale].sendError);
    addMessage('assistant', result.reply); history.push({ role: 'assistant', content: result.reply }); setMode(result.mode);
  } catch (error) { loading.remove(); addMessage('assistant', error.message || text[locale].sendError); }
  finally { busy = false; input.disabled = false; form.querySelector('#send-message').disabled = false; input.focus(); }
}
function wavFromBuffer(buffer, sampleRate = 16000) {
  const length = Math.floor(buffer.duration * sampleRate);
  const output = new ArrayBuffer(44 + length * 2);
  const view = new DataView(output);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * 2, true);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  const inputRate = buffer.sampleRate;
  for (let i = 0; i < length; i++) {
    const position = i * inputRate / sampleRate;
    const left = Math.floor(position); const fraction = position - left;
    let sample = 0;
    for (const channel of channels) sample += (channel[left] || 0) * (1 - fraction) + (channel[left + 1] || channel[left] || 0) * fraction;
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return output;
}
async function transcribeRecording(blob, language) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('audio_format');
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      if (!decoded.duration || decoded.duration > 30) throw new Error('audio_format');
      const wav = wavFromBuffer(decoded);
      const response = await fetch(`/api/transcribe?locale=${language}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'voice_unavailable');
      if (!result.transcript) throw new Error('no_speech');
      input.value = [input.value.trim(), result.transcript].filter(Boolean).join(' ');
      input.focus(); notice('');
    } finally { await context.close(); }
  } catch (error) {
    const messages = text[locale];
    notice(error.message === 'voice_unavailable' ? messages.micNoModel : error.message === 'voice_invalid_audio' || error.message === 'audio_format' ? messages.micFormat : error.message === 'no_speech' ? messages.micNoSpeech : error.message === 'voice_busy' ? messages.micProcessing : messages.micFailed);
  } finally {
    voiceButton.disabled = false; voiceButton.textContent = '🎙'; voiceButton.classList.remove('listening'); voiceButton.title = text[locale].voiceLabel; voiceButton.setAttribute('aria-label', text[locale].voiceLabel);
  }
}
async function startRecording() {
  notice('');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { notice(text[locale].micUnsupported); return; }
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('audio_format');
    recorder = new MediaRecorder(microphoneStream, { mimeType }); audioChunks = [];
    const language = locale;
    recorder.ondataavailable = event => { if (event.data.size) audioChunks.push(event.data); };
    recorder.onerror = () => { notice(text[locale].micFailed); stopRecording(); };
    recorder.onstop = () => {
      clearTimeout(recordingTimer); microphoneStream?.getTracks().forEach(track => track.stop()); microphoneStream = null;
      const clip = new Blob(audioChunks, { type: mimeType }); recorder = null; audioChunks = [];
      if (!clip.size) { dictating = false; voiceButton.disabled = false; voiceButton.textContent = '🎙'; voiceButton.classList.remove('listening'); notice(text[locale].micNoSpeech); return; }
      notice(text[locale].micProcessing); voiceButton.disabled = true; voiceButton.textContent = '…';
      transcribeRecording(clip, language);
    };
    recorder.start(); dictating = true; voiceButton.textContent = '⏹'; voiceButton.classList.add('listening'); voiceButton.title = text[locale].dictating; voiceButton.setAttribute('aria-label', text[locale].dictating); notice(text[locale].micListening);
    recordingTimer = setTimeout(stopRecording, 30_000);
  } catch (error) {
    microphoneStream?.getTracks().forEach(track => track.stop()); microphoneStream = null;
    dictating = false; voiceButton.textContent = '🎙'; voiceButton.classList.remove('listening'); voiceButton.setAttribute('aria-label', text[locale].voiceLabel);
    notice(error.name === 'NotAllowedError' || error.name === 'SecurityError' ? text[locale].micDenied : error.name === 'NotFoundError' ? text[locale].micNoDevice : error.message === 'audio_format' ? text[locale].micFormat : text[locale].micFailed);
  }
}
function stopRecording() {
  if (!dictating) return;
  dictating = false; clearTimeout(recordingTimer);
  if (recorder?.state === 'recording') recorder.stop();
}
function setupVoiceInput() {
  voiceButton.addEventListener('click', () => dictating ? stopRecording() : startRecording());
}
form.addEventListener('submit', event => { event.preventDefault(); send(input.value); });
suggestions.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.menu) return showMenu(button.dataset.menu);
  if (button.dataset.back) return showMainSuggestions();
  if (button.dataset.question) { document.querySelector('#chat').scrollIntoView({ behavior: 'smooth' }); send(button.dataset.question); }
});
languagePicker.addEventListener('change', () => { locale = languagePicker.value === 'en' ? 'en' : 'ru'; localStorage.setItem('lumident-locale', locale); applyLanguage(); });
setupVoiceInput(); applyLanguage();
fetch('/api/status').then(response => response.json()).then(data => setMode(data.mode)).catch(() => setMode('unavailable'));
