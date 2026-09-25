const form = document.querySelector('#chat-form');
const input = document.querySelector('#question');
const messagesEl = document.querySelector('#messages');
const modeEl = document.querySelector('#mode');
const suggestions = document.querySelector('#suggestions');
const sessionId = crypto.randomUUID();
let history = [];
let busy = false;
const menus = {
  services: [
    ['Консультация', 'Расскажите о консультации стоматолога'],
    ['Лечение кариеса', 'Сколько стоит лечение кариеса?'],
    ['Профессиональная гигиена', 'Сколько стоит профессиональная гигиена?'],
    ['Имплантация', 'Расскажите об имплантации зуба'],
    ['Все услуги', 'Какие услуги доступны в LumiDent?']
  ],
  guarantees: [
    ['Материалы', 'Какие материалы и производителей вы используете?'],
    ['Гарантии на работы', 'Какие гарантии есть на лечение и работы?'],
    ['Пломбы', 'Какие материалы вы используете для пломб и какая гарантия?']
  ]
};
function showMainSuggestions() {
  suggestions.innerHTML = '<button type="button" data-menu="services">Услуги</button><button type="button" data-menu="guarantees">Гарантия</button><button type="button" data-question="Хочу записаться на приём">Записаться</button>';
  suggestions.hidden = false;
}
function showMenu(name) {
  suggestions.innerHTML = menus[name].map(([label, question]) => `<button type="button" data-question="${question}">${label}</button>`).join('') + '<button type="button" data-back="true">Назад</button>';
  suggestions.hidden = false;
}
function setMode(mode) {
  modeEl.innerHTML = '<span class="pulse"></span> ' + (mode === 'live' ? 'DeepSeek на связи' : 'Справочник клиники');
}
function addMessage(role, content) {
  const item = document.createElement('div'); item.className = 'message ' + (role === 'user' ? 'user' : 'bot');
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = content;
  const time = document.createElement('time'); time.textContent = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  item.append(bubble, time); messagesEl.append(item); messagesEl.scrollTop = messagesEl.scrollHeight;
  return item;
}
async function send(text) {
  if (busy || !text.trim()) return;
  busy = true; input.value = ''; input.disabled = true; form.querySelector('button').disabled = true; suggestions.hidden = true;
  addMessage('user', text.trim()); history.push({ role: 'user', content: text.trim() });
  const loading = addMessage('assistant', 'Печатает…'); loading.classList.add('loading');
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-25), sessionId }) });
    const result = await response.json();
    loading.remove();
    if (!response.ok) throw new Error(result.error || 'Не удалось получить ответ. Попробуйте ещё раз.');
    addMessage('assistant', result.reply); history.push({ role: 'assistant', content: result.reply });
    setMode(result.mode);
  } catch (error) { loading.remove(); addMessage('assistant', error.message || 'Сейчас не удаётся получить ответ. Попробуйте ещё раз.'); }
  finally { busy = false; input.disabled = false; form.querySelector('button').disabled = false; input.focus(); }
}
form.addEventListener('submit', event => { event.preventDefault(); send(input.value); });
suggestions.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.menu) return showMenu(button.dataset.menu);
  if (button.dataset.back) return showMainSuggestions();
  if (button.dataset.question) { document.querySelector('#chat').scrollIntoView({ behavior: 'smooth' }); send(button.dataset.question); }
});
fetch('/api/status').then(r => r.json()).then(data => { setMode(data.mode); }).catch(() => { modeEl.textContent = 'Временно недоступен'; });
