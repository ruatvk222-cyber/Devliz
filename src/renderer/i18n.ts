import type { AppLanguage } from '@shared/types';
import { useApp } from './store';

type Dict = Record<string, string>;

const en: Dict = {
  'sidebar.profiles': 'Profiles',
  'sidebar.proxies': 'Proxies',
  'sidebar.automation': 'Automation',
  'sidebar.settings': 'Settings',
  'sidebar.running': 'Running',
  'sidebar.total': 'Total',

  'profiles.title': 'Profiles',
  'profiles.search': 'Search by name, tag, group…',
  'profiles.allGroups': 'All groups',
  'profiles.bulkCreate': 'Bulk create',
  'profiles.launchSelected': 'Launch selected',
  'profiles.stopAll': 'Stop all',
  'profiles.deleteSelected': 'Delete selected',
  'profiles.runAutomation': 'Run automation',
  'profiles.empty': 'No profiles yet.',
  'profiles.emptyCta': 'Bulk create your first profiles',
  'profiles.col.name': 'Name',
  'profiles.col.group': 'Group',
  'profiles.col.status': 'Status',
  'profiles.col.os': 'OS',
  'profiles.col.locale': 'Locale',
  'profiles.col.timezone': 'Timezone',
  'profiles.col.proxy': 'Proxy',
  'profiles.col.actions': 'Actions',
  'profiles.deleteConfirmOne': 'Delete this profile? This will not delete its on-disk data dir.',
  'profiles.deleteConfirmMany': 'Delete {n} profiles?',
  'profiles.addExtension': 'Add extension',
  'profiles.renameHint': 'Click to edit · double-click to rename inline',

  'proxies.title': 'Proxies',
  'proxies.bulkImport': 'Bulk import',
  'proxies.checkAll': 'Check all',
  'proxies.deleteSelected': 'Delete selected',
  'proxies.deleteConfirmOne': 'Delete this proxy? Profiles using it will fall back to direct.',
  'proxies.deleteConfirmMany': 'Delete {n} proxies?',
  'proxies.col.type': 'Type',
  'proxies.col.hostPort': 'Host:Port',
  'proxies.col.auth': 'Auth',
  'proxies.col.status': 'Status',
  'proxies.col.label': 'Label',
  'proxies.col.actions': 'Actions',
  'settings.title': 'Settings',
  'settings.browserHeader': 'Browser',
  'settings.appearanceHeader': 'Appearance',
  'settings.fingerprintHeader': 'Fingerprint',
  'settings.performanceHeader': 'Performance',
  'settings.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.language': 'Language',
  'settings.forceEnUsLocale': 'Force en-US locale on every new profile',
  'settings.forceEnUsLocaleHelp':
    'When enabled (default), every newly-created profile uses navigator.language=en-US. Turn off to draw from the random locale pool.',
  'settings.chromePath': 'Chrome / Edge / Chromium binary path',
  'settings.autoDetect': 'Auto-detect',
  'settings.chromePathHelp': 'Leave empty to auto-detect on launch.',
  'settings.defaultStartUrl': 'Default start URL',
  'settings.maxConcurrent': 'Max concurrent launches (1–50)',
  'settings.maxConcurrentHelp':
    'When you launch a batch of profiles, this many start in parallel.',
  'settings.profilesRoot': 'Profiles root directory (optional override)',
  'settings.save': 'Save settings',
  'settings.saving': 'Saving…',
  'settings.savedAt': 'Saved at',
  'settings.diagnosticsHeader': 'Launch diagnostics',
  'settings.diagnosticsHelp':
    'Every time you launch a profile we write a log with the chrome path, all spawn arguments, exit code, and any browser stderr. If extensions or proxies misbehave, click the most recent log and paste it to support.',
  'settings.diagnosticsEmpty': 'No launch logs yet. Launch a profile and they will show up here.',
  'settings.diagnosticsRefresh': 'Refresh',
  'settings.diagnosticsOpenFolder': 'Open logs folder',
  'settings.diagnosticsCopy': 'Copy',

  'automation.title': 'Automation',
  'automation.subtitle':
    'Pick an automation, configure it, then run it on one or more profiles.',
  'automation.gar.name': 'Auto Gmail Reader',
  'automation.gar.desc':
    'Open Gmail in the selected profile, click each unread message, dwell on it, then go back to the inbox. Stops after N emails or when the inbox is clear.',
  'automation.readSeconds': 'Reading time per email (seconds)',
  'automation.maxItems': 'Max number of emails',
  'automation.humanLike': 'Natural cadence (random ±20%)',
  'automation.closeOnFinish': 'Close profile automatically when finished',
  'automation.run': 'Run automation',
  'automation.profilesPicker': 'Profiles to run',
  'automation.noProfiles': 'No profiles yet — create some on the Profiles tab first.',
  'automation.selectAll': 'Select all',
  'automation.clear': 'Clear',
  'automation.openButton': 'Configure & run',

  'common.cancel': 'Cancel',
  'common.saving': 'Working…',

  'extensions.modalTitle': 'Add extension to {n} profile(s)',
  'extensions.modalDescription':
    'Pick a source. The extension will be installed and attached to all {n} selected profile(s) — they\'ll load it next time they launch.',
  'extensions.tabFolder': 'Unpacked folder',
  'extensions.tabZip': 'ZIP / CRX file',
  'extensions.tabStore': 'Chrome Web Store',
  'extensions.folderLabel': 'Path to the unpacked extension folder',
  'extensions.folderHint':
    'Pick the folder that contains manifest.json (same folder you\'d use in chrome://extensions "Load unpacked").',
  'extensions.zipLabel': 'Path to the .zip or .crx file',
  'extensions.zipHint':
    'The archive will be unpacked into the app\'s extensions folder.',
  'extensions.storeLabel': 'Chrome Web Store URL or extension ID',
  'extensions.storeHint':
    'The .crx will be downloaded from Google\'s update server and unpacked. No web store login is involved.',
  'extensions.nameLabel': 'Display name (optional)',
  'extensions.namePlaceholder': 'e.g. uBlock Origin',
  'extensions.browse': 'Browse…',
  'extensions.install': 'Install & attach',
  'extensions.reuseLabel':
    'Reuse an extension you already added (optional)',
  'extensions.reuseAddNew': 'Add a new one',
  'extensions.errPickFolder': 'Pick the unpacked extension folder.',
  'extensions.errPickZip': 'Pick the .zip / .crx file.',
  'extensions.errPickStore': 'Paste a Chrome Web Store URL or extension ID.',
  'extensions.errNoProfiles': 'Select at least one profile first.',
  'extensions.progressInstalling': 'Installing…',
  'extensions.progressDownloading': 'Downloading from Web Store…',
  'extensions.progressAttaching': 'Attaching to profiles…',
  'extensions.installedHeader': 'Already installed',
  'extensions.installedHint':
    'Pick from extensions you already added. Tick multiple to attach all of them at once.',
  'extensions.attachSelected': 'Attach {n} selected',
  'extensions.installedEmpty':
    'You haven\'t added any extensions yet. Use the tabs above to install one.',

  'settings.aboutHeader': 'About',
  'settings.appVersion': 'App version',
  'settings.checkForUpdates': 'Check for updates',
  'settings.checking': 'Checking…',
  'settings.upToDate': 'You\'re on the latest version.',
  'settings.updateAvailable': 'New version {v} available',
  'settings.updateError': 'Update check failed',
  'settings.downloadUpdate': 'Download update',
  'settings.downloading': 'Downloading…',
  'settings.installUpdate': 'Install & restart',
  'settings.releaseNotes': 'Release notes',
  'settings.dev_mode_no_update':
    'Auto-update only works in the installed app. (Dev mode detected.)',
};

const vi: Dict = {
  'sidebar.profiles': 'Hồ sơ',
  'sidebar.proxies': 'Proxy',
  'sidebar.automation': 'Tự động',
  'sidebar.settings': 'Cài đặt',
  'sidebar.running': 'Đang chạy',
  'sidebar.total': 'Tổng',

  'profiles.title': 'Hồ sơ',
  'profiles.search': 'Tìm theo tên, tag, nhóm…',
  'profiles.allGroups': 'Tất cả nhóm',
  'profiles.bulkCreate': 'Tạo hàng loạt',
  'profiles.launchSelected': 'Khởi chạy đã chọn',
  'profiles.stopAll': 'Dừng tất cả',
  'profiles.deleteSelected': 'Xoá đã chọn',
  'profiles.runAutomation': 'Chạy automation',
  'profiles.empty': 'Chưa có hồ sơ nào.',
  'profiles.emptyCta': 'Tạo hàng loạt hồ sơ đầu tiên',
  'profiles.col.name': 'Tên',
  'profiles.col.group': 'Nhóm',
  'profiles.col.status': 'Trạng thái',
  'profiles.col.os': 'Hệ điều hành',
  'profiles.col.locale': 'Ngôn ngữ',
  'profiles.col.timezone': 'Múi giờ',
  'profiles.col.proxy': 'Proxy',
  'profiles.col.actions': 'Hành động',
  'profiles.deleteConfirmOne':
    'Xoá hồ sơ này? Thư mục dữ liệu trên đĩa sẽ KHÔNG bị xoá.',
  'profiles.deleteConfirmMany': 'Xoá {n} hồ sơ?',
  'profiles.addExtension': 'Thêm extension',
  'profiles.renameHint': 'Click để mở · click đôi để đổi tên nhanh',

  'proxies.title': 'Proxy',
  'proxies.bulkImport': 'Nhập hàng loạt',
  'proxies.checkAll': 'Kiểm tra tất cả',
  'proxies.deleteSelected': 'Xoá đã chọn',
  'proxies.deleteConfirmOne': 'Xoá proxy này? Hồ sơ đang dùng sẽ chuyển sang kết nối trực tiếp.',
  'proxies.deleteConfirmMany': 'Xoá {n} proxy?',
  'proxies.col.type': 'Loại',
  'proxies.col.hostPort': 'Host:Port',
  'proxies.col.auth': 'Xác thực',
  'proxies.col.status': 'Trạng thái',
  'proxies.col.label': 'Nhãn',
  'proxies.col.actions': 'Hành động',
  'settings.title': 'Cài đặt',
  'settings.browserHeader': 'Trình duyệt',
  'settings.appearanceHeader': 'Giao diện',
  'settings.fingerprintHeader': 'Fingerprint',
  'settings.performanceHeader': 'Hiệu năng',
  'settings.theme': 'Chủ đề',
  'settings.theme.dark': 'Tối',
  'settings.theme.light': 'Sáng',
  'settings.language': 'Ngôn ngữ',
  'settings.forceEnUsLocale': 'Mặc định en-US cho mọi hồ sơ mới',
  'settings.forceEnUsLocaleHelp':
    'Khi bật (mặc định), mọi hồ sơ mới sẽ có navigator.language=en-US. Tắt để lấy ngẫu nhiên từ pool ngôn ngữ.',
  'settings.chromePath': 'Đường dẫn Chrome / Edge / Chromium',
  'settings.autoDetect': 'Tự dò',
  'settings.chromePathHelp': 'Bỏ trống để tự dò khi chạy.',
  'settings.defaultStartUrl': 'URL mặc định khi mở',
  'settings.maxConcurrent': 'Số profile chạy song song tối đa (1–50)',
  'settings.maxConcurrentHelp':
    'Khi bạn chạy hàng loạt hồ sơ, sẽ có chừng này khởi chạy cùng lúc.',
  'settings.profilesRoot': 'Thư mục lưu hồ sơ (không bắt buộc)',
  'settings.save': 'Lưu cài đặt',
  'settings.saving': 'Đang lưu…',
  'settings.savedAt': 'Đã lưu lúc',
  'settings.diagnosticsHeader': 'Nhật ký khởi chạy',
  'settings.diagnosticsHelp':
    'Mỗi lần launch profile, app ghi 1 file log gồm path Chrome, đầy đủ tham số spawn, exit code và stderr của trình duyệt. Nếu extension/proxy gặp vấn đề, click vào log mới nhất, copy nội dung và gửi cho support.',
  'settings.diagnosticsEmpty': 'Chưa có log nào. Hãy launch 1 profile, log sẽ xuất hiện ở đây.',
  'settings.diagnosticsRefresh': 'Tải lại',
  'settings.diagnosticsOpenFolder': 'Mở thư mục log',
  'settings.diagnosticsCopy': 'Copy',

  'automation.title': 'Tự động',
  'automation.subtitle':
    'Chọn 1 automation, chỉnh thông số, rồi chạy trên 1 hoặc nhiều hồ sơ.',
  'automation.gar.name': 'Tự động đọc Gmail',
  'automation.gar.desc':
    'Mở Gmail trong hồ sơ đã chọn, click vào từng email chưa đọc, dừng lại đọc, rồi quay về Inbox. Dừng khi đọc đủ N email hoặc hết email chưa đọc.',
  'automation.readSeconds': 'Thời gian đọc mỗi email (giây)',
  'automation.maxItems': 'Tối đa số email',
  'automation.humanLike': 'Cadence tự nhiên (random ±20%)',
  'automation.closeOnFinish': 'Tự đóng hồ sơ khi xong',
  'automation.run': 'Chạy automation',
  'automation.profilesPicker': 'Hồ sơ sẽ chạy',
  'automation.noProfiles':
    'Chưa có hồ sơ nào — vào tab Hồ sơ để tạo trước.',
  'automation.selectAll': 'Chọn tất cả',
  'automation.clear': 'Bỏ chọn',
  'automation.openButton': 'Cấu hình & chạy',

  'common.cancel': 'Huỷ',
  'common.saving': 'Đang xử lý…',

  'extensions.modalTitle': 'Thêm extension vào {n} hồ sơ',
  'extensions.modalDescription':
    'Chọn nguồn. Extension sẽ được cài và áp vào toàn bộ {n} hồ sơ đã chọn — lần launch tới sẽ tự load.',
  'extensions.tabFolder': 'Thư mục unpacked',
  'extensions.tabZip': 'File ZIP / CRX',
  'extensions.tabStore': 'Chrome Web Store',
  'extensions.folderLabel': 'Đường dẫn thư mục extension unpacked',
  'extensions.folderHint':
    'Chọn thư mục chứa manifest.json (giống lúc "Load unpacked" trong chrome://extensions).',
  'extensions.zipLabel': 'Đường dẫn file .zip hoặc .crx',
  'extensions.zipHint':
    'File sẽ được giải nén vào thư mục extension của app.',
  'extensions.storeLabel': 'URL Chrome Web Store hoặc ID extension',
  'extensions.storeHint':
    'App tải file .crx trực tiếp từ Google rồi giải nén. Không cần login Web Store.',
  'extensions.nameLabel': 'Tên hiển thị (không bắt buộc)',
  'extensions.namePlaceholder': 'vd: uBlock Origin',
  'extensions.browse': 'Chọn…',
  'extensions.install': 'Cài & áp dụng',
  'extensions.reuseLabel':
    'Dùng lại extension đã thêm (không bắt buộc)',
  'extensions.reuseAddNew': 'Thêm mới',
  'extensions.errPickFolder': 'Chọn thư mục extension unpacked.',
  'extensions.errPickZip': 'Chọn file .zip / .crx.',
  'extensions.errPickStore': 'Dán URL Chrome Web Store hoặc ID extension.',
  'extensions.errNoProfiles': 'Chọn ít nhất 1 hồ sơ trước.',
  'extensions.progressInstalling': 'Đang cài…',
  'extensions.progressDownloading': 'Đang tải từ Web Store…',
  'extensions.progressAttaching': 'Đang áp vào hồ sơ…',
  'extensions.installedHeader': 'Đã cài sẵn',
  'extensions.installedHint':
    'Chọn từ các extension bạn đã thêm trước đó. Tick nhiều cái để áp tất cả cùng lúc.',
  'extensions.attachSelected': 'Áp {n} đã chọn',
  'extensions.installedEmpty':
    'Bạn chưa thêm extension nào. Dùng các tab ở trên để cài.',

  'settings.aboutHeader': 'Giới thiệu',
  'settings.appVersion': 'Phiên bản app',
  'settings.checkForUpdates': 'Kiểm tra cập nhật',
  'settings.checking': 'Đang kiểm tra…',
  'settings.upToDate': 'Bạn đang dùng bản mới nhất.',
  'settings.updateAvailable': 'Có bản mới {v}',
  'settings.updateError': 'Kiểm tra cập nhật thất bại',
  'settings.downloadUpdate': 'Tải bản mới',
  'settings.downloading': 'Đang tải…',
  'settings.installUpdate': 'Cài & khởi động lại',
  'settings.releaseNotes': 'Ghi chú phát hành',
  'settings.dev_mode_no_update':
    'Tính năng auto-update chỉ chạy ở bản cài đặt. (Đang ở dev mode.)',
};

const dicts: Record<AppLanguage, Dict> = { 'en-US': en, 'vi-VN': vi };

export function translate(lang: AppLanguage, key: string, vars?: Record<string, string | number>): string {
  const dict = dicts[lang] ?? en;
  let template = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replace(`{${k}}`, String(v));
    }
  }
  return template;
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const language = useApp((s) => s.settings.language);
  return (key, vars) => translate(language, key, vars);
}
