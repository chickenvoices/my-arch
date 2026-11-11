import GLib from 'gi://GLib';
const STRINGS = {
  ru: {
    'Display Profiles': 'Профили дисплеев',
    'Profiles': 'Профили',
    'Toggle Displays': 'Активные дисплеи',
    'Save Current Profile...': 'Сохранить профиль настроек дисплеев',
    'Delete Profile...': 'Удалить профиль',
    'Applied profile: %s': 'Используется профиль «%s»',
    'Auto-applied profile: %s': 'Профиль «%s» применен автоматически',
    '%s turned on': 'Дисплей «%s» включен',
    '%s turned off': 'Дисплей «%s» отключен',
    'Saved profile \'%s\'.': 'Профиль «%s» сохранен',
    'Deleted profile \'%s\'.': 'Профиль «%s» удален',
    'Failed to save: %s': 'Не удалось сохранить профиль «%s»',
    'Failed to delete: %s': 'Не удалось удалить профиль «%s»',
    'Error: %s': 'Ошибка: %s',
    'Error: No active display state cached.': 'Ошибка: нет сохранённого состояния дисплеев',
    'No profiles to delete.': 'Сохраненных профилей нет',
    'No logical monitors to apply.': 'Нет мониторов для применения.',
    'Profile \'%s\' does not exist.': 'Профиль «%s» не существует.',
    'Profile \'%s\' has a corrupted configuration file.': 'Файл конфигурации профиля «%s» повреждён.',
    'Monitor \'%s\' is disconnected or asleep.': 'Монитор «%s» отключён или находится в спящем режиме.',
    'No active profile.': 'Нет активного профиля.',
    'Profile \'%s\' missing.': 'Профиль «%s» отсутствует.',
    'Alias \'%s\' not found.': 'Псевдоним «%s» не найден.',
    'Display \'%s\' is disconnected or asleep.': 'Дисплей «%s» отключён или находится в спящем режиме.',
    'Cannot disable the last active monitor.': 'Нельзя отключить последний активный монитор.',
    'Save Display Profile': 'Сохранение профиля настроек дисплеев',
    'Profile Name': 'Название профиля',
    'Give it a name': 'придумайте название',
    'Assign Display Aliases (e.g. left, tv):': 'Изменение названий для дисплеев',
    'HDR is active (state will be saved)': 'Используется HDR (состояние будет сохранено)',
    'Cancel': 'Отмена',
    'Save Profile': 'Сохранить профиль',
    'Error: Profile name is required.': 'Ошибка: необходимо указать название профиля',
    'Delete Display Profile': 'Удаление профиля дисплеев',
    'Select a profile to delete:': 'Выберите профиль для удаления',
    'Delete': 'Удалить',
    'This will permanently remove the selected profile.': 'Это действие безвозвратно удалит выбранный профиль',
    'General Settings': 'Общие настройки',
    'Show Top Bar Icon': 'Показывать значок в верхней панели',
    'Toggle the visibility of the display profiles menu indicator': 'Включить или отключить индикатор меню профилей дисплеев',
    'Show Notifications': 'Показывать уведомления',
    'Show system notifications for profile and display events': 'Показывать системные уведомления о событиях профиля и подключенных дисплеев',
    'Profile Switcher': 'Переключатель профилей',
    'Hold this shortcut to see a picker of your saved profiles, and release it to switch to the highlighted one — like Alt+Tab.': 'Удерживайте это сочетание клавиш, чтобы увидеть список сохранённых профилей, и отпустите его, чтобы переключиться на выделенный',
    'Keyboard Shortcut': 'Сочетание клавиш',
    'Not set': 'Не задано',
    'Record…': 'Записать…',
    'Clear shortcut': 'Очистить сочетание',
    'Record Shortcut': 'Запись сочетания клавиш',
    'Hold a modifier (Super, Ctrl, Alt…) and press a key…': 'Удерживайте модификатор (Super, Ctrl, Alt…) и нажмите клавишу…',
    'This shortcut needs at least one modifier key — try again holding Super, Ctrl, or Alt': 'Сочетанию нужен хотя бы один модификатор — попробуйте ещё раз, удерживая Super, Ctrl или Alt',
    'Switch to a Latin (e.g. English) keyboard layout before recording, or the shortcut may not work once you switch layouts back': 'Переключитесь на латинскую (например, английскую) раскладку перед записью — иначе сочетание может не сработать после переключения обратно',
    'That combination can\'t be used — try another.': 'Эта комбинация не может быть использована — попробуйте другую'
  }
};
let _cachedLang = null;
function _detectLang() {
  if (_cachedLang !== null) return _cachedLang;
  const langs = GLib.get_language_names();
  _cachedLang = langs.find(l => l.startsWith('ru')) ? 'ru' : 'en';
  return _cachedLang;
}
export function _(text, ...args) {
  const lang = _detectLang();
  let translated = text;
  if (lang !== 'en') {
    const table = STRINGS[lang];
    if (table && table[text]) translated = table[text];
  }
  if (args.length === 0) return translated;
  let i = 0;
  return translated.replace(/%[sd]/g, () => {
    const val = args[i++];
    return val === undefined ? '' : String(val);
  });
}
export function _resetLangCache() {
  _cachedLang = null;
}
