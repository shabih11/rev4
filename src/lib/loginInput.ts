export function normalizeLoginEmail(email: string) {
  return email.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}

export function normalizeLoginPassword(password: string) {
  // The app's numeric passwords can be typed with Arabic or Persian keyboards.
  // Preserve every character of nonnumeric passwords.
  if (!/^[\d٠-٩۰-۹]+$/.test(password.trim())) return password;
  return password.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));
}

export function loginErrorMessage(code: string) {
  switch (code) {
    case 'auth/invalid-email': return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تحققي من البريد وبيانات الدخول المحفوظة في المتصفح.';
    case 'auth/too-many-requests': return 'توقفت المحاولات مؤقتًا بسبب تكرارها. انتظري قليلًا ثم أعيدي المحاولة.';
    case 'auth/network-request-failed': return 'تعذر الاتصال بخدمة الدخول. تحققي من الإنترنت ثم أعيدي المحاولة.';
    case 'auth/user-disabled': return 'هذا الحساب موقوف. تواصلي مع الإدارة.';
    default: return 'تعذر تسجيل الدخول الآن. أعيدي المحاولة أو تواصلي مع الإدارة.';
  }
}
