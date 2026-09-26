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
let recognition = null;
let dictating = false;

const text = {
  ru: {
    navServices: 'Услуги', navAbout: 'О клинике', navContacts: 'Контакты', askQuestion: 'Задать вопрос ↗',
    alwaysHere: 'Всегда на связи', heroTitle: 'Забота начинается с разговора', heroText: 'Спросите об услугах, стоимости и материалах. Цифровой администратор LumiDent поможет сориентироваться.', startChat: 'Начать диалог ↗', heroNote: 'Ответим на ваши вопросы в любое время',
    everyDay: 'Каждый день', moscow: 'Москва', address: 'ул. Сиреневая, 18', gentleCare: 'Бережный подход', treatmentPlan: 'План лечения после осмотра', chatKicker: 'ВАШ ВОПРОС — НАШ ОТВЕТ', chatTitle: 'Поговорим о вашей улыбке?', chatSubtitle: 'Узнайте об услугах и ценах клиники.', assistantName: 'Администратор LumiDent', assistantStatus: 'Готов помочь с вашим вопросом', greeting: 'Здравствуйте! Я цифровой администратор LumiDent. Расскажу об услугах и ценах. О чём хотите узнать?', now: 'Сейчас', messageLabel: 'Ваше сообщение', placeholder: 'Напишите ваш вопрос…', voiceLabel: 'Голосовой ввод', sendLabel: 'Отправить сообщение', chatNote: 'Информация не заменяет очную консультацию врача. Для голосового ввода браузер может использовать собственные сервисы распознавания речи.',
    careEveryStep: 'ЗАБОТА НА КАЖДОМ ЭТАПЕ', popularServices: 'Популярные услуги', priceNote: 'Точную стоимость врач определит после осмотра и диагностики.', closingTitle: 'Ваш путь к улыбке начинается с вопроса', writeReception: 'Написать администратору ↗', footerAbout: 'Стоматология с вниманием к каждой улыбке.', contactsTitle: 'Контакты', footerAddress: 'Москва, ул. Сиреневая, 18', footerHours: 'Ежедневно, 09:00–21:00', navigation: 'Навигация', askShort: 'Задать вопрос', footerNote: 'Информация не заменяет очную консультацию врача.',
    serviceAsk: 'Спросить ↗', priceFrom: 'от', noServices: 'Список услуг временно недоступен.', typing: 'Печатает…', modeLive: 'AI-администратор на связи', modeDemo: 'Справочник клиники', modeUnavailable: 'Ассистент временно недоступен', sendError: 'Не удалось получить ответ. Попробуйте ещё раз.', micUnsupported: 'Голосовой ввод не поддерживается этим браузером. Напишите вопрос.', micDenied: 'Нет доступа к микрофону. Разрешите доступ в настройках браузера или напишите вопрос.', micNoSpeech: 'Не удалось распознать речь. Попробуйте ещё раз.', dictating: 'Слушаю… Нажмите, чтобы остановить', speak: 'Озвучить ответ', speechUnsupported: 'Озвучка не поддерживается этим браузером.',
    servicesMenu: [['Консультация', 'Расскажите о консультации стоматолога'], ['Лечение кариеса', 'Сколько стоит лечение кариеса?'], ['Профессиональная гигиена', 'Сколько стоит профессиональная гигиена?'], ['Имплантация', 'Расскажите об имплантации зуба'], ['Все услуги', 'Какие услуги доступны в LumiDent?']],
    guaranteesMenu: [['Материалы', 'Какие материалы и производителей вы используете?'], ['Гарантии на работы', 'Какие гарантии есть на лечение и работы?'], ['Пломбы', 'Какие материалы вы используете для пломб и какая гарантия?']],
    mainButtons: ['Услуги', 'Гарантия', 'Записаться'], offTopic: 'ГОЛОСОВОЙ ВВОД', back: 'Назад'
  },
  en: {
    navServices: 'Services', navAbout: 'About', navContacts: 'Contacts', askQuestion: 'Ask a question ↗',
    alwaysHere: 'Here to help', heroTitle: 'Care begins with a conversation', heroText: 'Ask about treatments, prices, and materials. The LumiDent digital receptionist can help you find your way.', startChat: 'Start a chat ↗', heroNote: 'Ask us a question any time',
    everyDay: 'Every day', moscow: 'Moscow', address: '18 Sirenevaya St.', gentleCare: 'Gentle care', treatmentPlan: 'Treatment plan after examination', chatKicker: 'YOUR QUESTION — OUR ANSWER', chatTitle: 'Let’s talk about your smile', chatSubtitle: 'Learn about clinic services and prices.', assistantName: 'LumiDent Receptionist', assistantStatus: 'Ready to help with your question', greeting: 'Hello! I’m LumiDent’s digital receptionist. I can tell you about services and prices. What would you like to know?', now: 'Now', messageLabel: 'Your message', placeholder: 'Type your question…', voiceLabel: 'Voice input', sendLabel: 'Send message', chatNote: 'Information is not a substitute for an in-person dental consultation. Your browser may use its own speech-recognition services for voice input.',
    careEveryStep: 'CARE AT EVERY STEP', popularServices: 'Popular services', priceNote: 'Your dentist will confirm the exact price after an examination and diagnostics.', closingTitle: 'Your path to a smile starts with a question', writeReception: 'Message the receptionist ↗', footerAbout: 'Dentistry with care for every smile.', contactsTitle: 'Contacts', footerAddress: '18 Sirenevaya St., Moscow', footerHours: 'Daily, 09:00–21:00', navigation: 'Navigation', askShort: 'Ask a question', footerNote: 'Information is not a substitute for an in-person dental consultation.',
    serviceAsk: 'Ask ↗', priceFrom: 'from', noServices: 'The service list is temporarily unavailable.', typing: 'Typing…', modeLive: 'AI receptionist is online', modeDemo: 'Clinic information', modeUnavailable: 'The assistant is temporarily unavailable', sendError: 'I could not get a response. Please try again.', micUnsupported: 'Voice input is not supported in this browser. Please type your question.', micDenied: 'Microphone access is blocked. Allow it in your browser settings or type your question.', micNoSpeech: 'No speech was detected. Please try again.', dictating: 'Listening… Click to stop', speak: 'Read answer aloud', speechUnsupported: 'Speech playback is not supported in this browser.',
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
  voiceButton.setAttribute('aria-label', dictionary.voiceLabel);
  voiceButton.title = dictionary.voiceLabel;
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
function setupVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { voiceButton.disabled = true; voiceButton.title = text[locale].micUnsupported; return; }
  recognition = new Recognition(); recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.onresult = event => { input.value = event.results[0][0].transcript; input.focus(); };
  recognition.onerror = event => notice(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? text[locale].micDenied : text[locale].micNoSpeech);
  recognition.onend = () => { dictating = false; voiceButton.textContent = '🎙'; voiceButton.classList.remove('listening'); voiceButton.title = text[locale].voiceLabel; };
  voiceButton.addEventListener('click', () => {
    if (dictating) { recognition.stop(); return; }
    notice(''); recognition.lang = locale === 'en' ? 'en-US' : 'ru-RU';
    try { recognition.start(); dictating = true; voiceButton.textContent = '⏹'; voiceButton.classList.add('listening'); voiceButton.title = text[locale].dictating; }
    catch { notice(text[locale].micDenied); }
  });
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
