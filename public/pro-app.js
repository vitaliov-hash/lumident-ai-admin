const $ = selector => document.querySelector(selector);
const localePicker = $('#language-switcher');
let user = null;
let knowledge = null;
let locale = localStorage.getItem('lumident-locale') === 'en' ? 'en' : 'ru';
const copy = {
  ru: {
    pageTitle: 'Вход в LumiDent для администратора', loginTitle: 'Вход администратора', emailLabel: 'Электронная почта', passwordLabel: 'Пароль', loginButton: 'Войти',
    securityTitle: 'Безопасность аккаунта', currentPassword: 'Текущий пароль', newPassword: 'Новый пароль (от 12 символов)', confirmPassword: 'Повторите новый пароль', changePassword: 'Изменить пароль', sessionsNotice: 'После смены пароля остальные активные сеансы будут завершены.',
    knowledgeTitle: 'База знаний клиники', hoursRu: 'Часы работы (русский)', hoursEn: 'Часы работы (английский)', addService: 'Добавить услугу', saveChanges: 'Сохранить изменения', logout: 'Выйти',
    serviceNameRu: 'Услуга (русский)', serviceDescriptionRu: 'Описание (русский)', serviceNameEn: 'Service (English)', serviceDescriptionEn: 'Description (English)', price: 'Цена от, ₽', remove: 'Удалить услугу',
    wrongRole: 'Эта ссылка предназначена только для администратора.', passwordChanged: 'Пароль изменён. Остальные активные сеансы завершены.', passwordsMismatch: 'Новые пароли не совпадают.', saveSuccess: 'Изменения сохранены.',
    errors: { 'Неверная почта или пароль.': 'Incorrect email or password.', 'Этот аккаунт не имеет прав администратора.': 'This account does not have administrator access.', 'Текущий пароль указан неверно.': 'The current password is incorrect.', 'Новый пароль должен отличаться от текущего.': 'The new password must be different from the current one.', 'Проверьте текущий пароль. Новый пароль должен содержать от 12 до 128 символов.': 'Check the current password. The new password must be 12–128 characters long.', 'Слишком много попыток. Попробуйте позже.': 'Too many attempts. Please try again later.', 'Проверьте услуги, цены и часы работы.': 'Check the services, prices, and opening hours.' }
  },
  en: {
    pageTitle: 'LumiDent administrator sign-in', loginTitle: 'Administrator sign-in', emailLabel: 'Email address', passwordLabel: 'Password', loginButton: 'Sign in',
    securityTitle: 'Account security', currentPassword: 'Current password', newPassword: 'New password (12 characters minimum)', confirmPassword: 'Confirm new password', changePassword: 'Change password', sessionsNotice: 'Changing your password will end all other active sessions.',
    knowledgeTitle: 'Clinic knowledge base', hoursRu: 'Opening hours (Russian)', hoursEn: 'Opening hours (English)', addService: 'Add service', saveChanges: 'Save changes', logout: 'Sign out',
    serviceNameRu: 'Service (Russian)', serviceDescriptionRu: 'Description (Russian)', serviceNameEn: 'Service (English)', serviceDescriptionEn: 'Description (English)', price: 'Price from, ₽', remove: 'Remove service',
    wrongRole: 'This link is for administrator access only.', passwordChanged: 'Password changed. All other active sessions have been ended.', passwordsMismatch: 'The new passwords do not match.', saveSuccess: 'Changes saved.',
    errors: { 'Неверная почта или пароль.': 'Incorrect email or password.', 'Этот аккаунт не имеет прав администратора.': 'This account does not have administrator access.', 'Текущий пароль указан неверно.': 'The current password is incorrect.', 'Новый пароль должен отличаться от текущего.': 'The new password must be different from the current one.', 'Проверьте текущий пароль. Новый пароль должен содержать от 12 до 128 символов.': 'Check the current password. The new password must be 12–128 characters long.', 'Слишком много попыток. Попробуйте позже.': 'Too many attempts. Please try again later.', 'Проверьте услуги, цены и часы работы.': 'Check the services, prices, and opening hours.' }
  }
};
function notice(message) { $('#notice').textContent = message || ''; }
function localizedError(message) { return copy[locale].errors[message] || message || (locale === 'en' ? 'The request could not be completed.' : 'Не удалось выполнить запрос.'); }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(localizedError(data.error));
  return data;
}
function element(tag, text, className) { const item = document.createElement(tag); item.textContent = text; if (className) item.className = className; return item; }
function translatePage() {
  document.documentElement.lang = locale; localePicker.value = locale;
  document.querySelectorAll('[data-i18n]').forEach(node => { const value = copy[locale][node.dataset.i18n]; if (value) node.textContent = value; });
  $('#logout').textContent = copy[locale].logout;
  if (knowledge && user?.role === 'admin') renderAdmin();
}
function showUser() {
  const isAdmin = user?.role === 'admin';
  $('#auth').hidden = isAdmin; $('#account-security').hidden = !isAdmin; $('#admin').hidden = !isAdmin; $('#logout').hidden = !isAdmin;
  if (!isAdmin) $('#auth-form').elements['login-secret'].value = '';
}
function serviceRow(service) {
  const row = element('div', '', 'admin-service'); row.dataset.id = service.id ?? '';
  const fields = [
    [copy[locale].serviceNameRu, 'name', service.name, true],
    [copy[locale].serviceNameEn, 'name_en', service.name_en || '', true],
    [copy[locale].price, 'price', service.price_from ?? '', false],
    [copy[locale].serviceDescriptionRu, 'description', service.description, true],
    [copy[locale].serviceDescriptionEn, 'description_en', service.description_en || '', true]
  ];
  for (const [title, field, value, required] of fields) {
    const label = element('label', title); const input = document.createElement('input'); input.value = value; input.dataset.field = field;
    if (field === 'price') { input.type = 'number'; input.min = '0'; input.max = '10000000'; }
    input.required = required; label.append(input); row.append(label);
  }
  const remove = element('button', copy[locale].remove); remove.type = 'button'; remove.addEventListener('click', () => row.remove()); row.append(remove);
  return row;
}
function renderAdmin() {
  $('#hours').value = knowledge.hours;
  $('#hours-en').value = knowledge.hours_en || '';
  const list = $('#admin-services'); list.replaceChildren();
  for (const service of knowledge.services) list.append(serviceRow(service));
}
async function loadKnowledge() { knowledge = await api('/api/admin/knowledge'); renderAdmin(); }
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: values.get('login-id'), password: values.get('login-secret'), targetRole: 'admin' }) });
    user = data.user; showUser(); notice(''); await loadKnowledge();
  } catch (error) { notice(error.message); }
  finally { form.elements['login-secret'].value = ''; }
});
$('#logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); user = null; showUser(); $('#password-form').reset(); notice(''); }
  catch (error) { notice(error.message); }
});
$('#password-form').addEventListener('submit', async event => {
  event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement);
  if (values.get('newPassword') !== values.get('confirmPassword')) { formElement.reset(); notice(copy[locale].passwordsMismatch); return; }
  try { await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: values.get('currentPassword'), newPassword: values.get('newPassword') }) }); notice(copy[locale].passwordChanged); }
  catch (error) { notice(error.message); }
  finally { formElement.reset(); }
});
$('#add-service').addEventListener('click', () => $('#admin-services').append(serviceRow({ id: null, name: '', description: '', name_en: '', description_en: '', price_from: null })));
$('#knowledge-form').addEventListener('submit', async event => {
  event.preventDefault();
  const services = [...document.querySelectorAll('.admin-service')].map(row => {
    const value = field => row.querySelector(`[data-field="${field}"]`).value.trim();
    return { id: row.dataset.id || null, name: value('name'), description: value('description'), name_en: value('name_en'), description_en: value('description_en'), price_from: value('price') === '' ? null : Number(value('price')) };
  });
  try { await api('/api/admin/knowledge', { method: 'PUT', body: JSON.stringify({ hours: $('#hours').value, hours_en: $('#hours-en').value, services }) }); await loadKnowledge(); notice(copy[locale].saveSuccess); }
  catch (error) { notice(error.message); }
});
localePicker.addEventListener('change', () => { locale = localePicker.value === 'en' ? 'en' : 'ru'; localStorage.setItem('lumident-locale', locale); translatePage(); });
async function init() {
  translatePage();
  try {
    const data = await api('/api/auth/me');
    if (data.user && data.user.role !== 'admin') { await api('/api/auth/logout', { method: 'POST' }); notice(copy[locale].wrongRole); return; }
    user = data.user; showUser(); if (user) await loadKnowledge();
  } catch (error) { showUser(); notice(error.message); }
}
init();
