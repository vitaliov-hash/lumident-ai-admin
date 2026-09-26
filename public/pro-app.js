const $ = selector => document.querySelector(selector);
let user = null; let active = null; let knowledge = null;
const notice = message => { $('#notice').textContent = message || ''; };
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}
function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
function showUser() {
  $('#auth').hidden = !!user; $('#client').hidden = user?.role !== 'client'; $('#admin').hidden = user?.role !== 'admin'; $('#logout').hidden = !user;
  $('#identity').textContent = user?.email || '';
}
async function loadKnowledge() {
  knowledge = await api('/api/knowledge');
  $('#public-hours').textContent = `Часы работы: ${knowledge.hours}`;
  const list = $('#service-list'); list.replaceChildren();
  for (const service of knowledge.services) {
    const card = element('article', ''); card.append(element('h3', service.name), element('p', service.description), element('strong', service.price_from == null ? 'Цена уточняется' : `от ${Number(service.price_from).toLocaleString('ru-RU')} ₽`)); list.append(card);
  }
  if (user?.role === 'admin') renderAdmin();
}
function renderAdmin() {
  $('#hours').value = knowledge.hours;
  const list = $('#admin-services'); list.replaceChildren();
  for (const service of knowledge.services) list.append(serviceRow(service));
}
function serviceRow(service) {
    const row = element('div', '', 'admin-service'); row.dataset.id = service.id ?? '';
    for (const [title, field, value] of [['Услуга', 'name', service.name], ['Цена от, ₽', 'price', service.price_from ?? ''], ['Описание', 'description', service.description]]) {
      const label = element('label', title); const input = document.createElement('input'); input.value = value; input.dataset.field = field;
      if (field === 'price') { input.type = 'number'; input.min = '0'; input.max = '10000000'; }
      input.required = field !== 'price'; label.append(input); row.append(label);
    }
    const remove = element('button', 'Удалить услугу'); remove.type = 'button'; remove.addEventListener('click', () => row.remove()); row.append(remove);
    return row;
}
$('#add-service').addEventListener('click', () => $('#admin-services').append(serviceRow({ id: null, name: '', description: '', price_from: null })));
async function listConversations() {
  const data = await api('/api/conversations'); const list = $('#conversations'); list.replaceChildren();
  if (!data.conversations.length) list.append(element('p', 'Пока нет диалогов.'));
  for (const conversation of data.conversations) {
    const button = element('button', conversation.title, 'conversation' + (String(active) === String(conversation.id) ? ' active' : ''));
    button.addEventListener('click', () => openConversation(conversation.id));
    const remove = element('button', 'Удалить', 'conversation-remove'); remove.setAttribute('aria-label', `Удалить разговор ${conversation.title}`);
    remove.addEventListener('click', async () => {
      if (!confirm('Удалить этот разговор без возможности восстановления?')) return;
      try { await api(`/api/conversations/${conversation.id}`, { method: 'DELETE' }); if (String(active) === String(conversation.id)) { active = null; $('#pro-messages').replaceChildren(); $('#chat-title').textContent = 'Разговор'; } await listConversations(); notice('Разговор удалён.'); } catch (error) { notice(error.message); }
    });
    list.append(button, remove);
  }
}
function appendMessage(role, content) {
  const item = element('div', '', `message ${role === 'user' ? 'user' : 'bot'}`); item.append(element('div', content, 'bubble')); $('#pro-messages').append(item); $('#pro-messages').scrollTop = $('#pro-messages').scrollHeight;
}
async function openConversation(id) {
  const data = await api(`/api/conversations/${id}`); active = id; $('#chat-title').textContent = data.conversation.title;
  $('#pro-messages').replaceChildren();
  for (const message of data.messages) appendMessage(message.role, message.content);
  await listConversations();
}
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const action = event.submitter?.value || 'login'; const form = new FormData(event.currentTarget);
  try { const data = await api(`/api/auth/${action}`, { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) }); user = data.user; showUser(); notice(''); if (user.role === 'client') await listConversations(); else await loadKnowledge(); }
  catch (error) { notice(error.message); }
});
$('#logout').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); user = null; active = null; $('#pro-messages').replaceChildren(); showUser(); notice('Вы вышли из аккаунта.'); } catch (error) { notice(error.message); } });
$('#new-chat').addEventListener('click', async () => { try { const data = await api('/api/conversations', { method: 'POST' }); await openConversation(data.conversation.id); } catch (error) { notice(error.message); } });
$('#pro-form').addEventListener('submit', async event => {
  event.preventDefault(); const input = $('#pro-input'); const text = input.value.trim(); if (!text) return;
  const button = event.currentTarget.querySelector('button'); button.disabled = true; input.disabled = true; notice('Получаем ответ…');
  try { if (!active) { const created = await api('/api/conversations', { method: 'POST' }); active = created.conversation.id; }
    const result = await api(`/api/conversations/${active}/messages`, { method: 'POST', body: JSON.stringify({ content: text }) });
    input.value = ''; await openConversation(active); notice('');
  } catch (error) { notice(error.message + ' Сообщение не сохранено; отправьте его повторно.'); }
  finally { button.disabled = false; input.disabled = false; input.focus(); }
});
$('#knowledge-form').addEventListener('submit', async event => {
  event.preventDefault();
  const services = [...document.querySelectorAll('.admin-service')].map(row => {
    const value = field => row.querySelector(`[data-field="${field}"]`).value.trim();
    return { id: row.dataset.id || null, name: value('name'), description: value('description'), price_from: value('price') === '' ? null : Number(value('price')) };
  });
  try { await api('/api/admin/knowledge', { method: 'PUT', body: JSON.stringify({ hours: $('#hours').value, services }) }); await loadKnowledge(); notice('Изменения сохранены.'); }
  catch (error) { notice(error.message); }
});
async function init() { try { const data = await api('/api/auth/me'); user = data.user; showUser(); await loadKnowledge(); if (user?.role === 'client') await listConversations(); } catch (error) { notice(error.message); } }
init();
