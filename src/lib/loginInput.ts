export function normalizeLoginEmail(email: string) {
  const value = email.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return value.toLowerCase() === 'admin' ? 'admin@rev4.local' : value;
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
    case 'email_address_invalid':
    case 'auth/invalid-email': return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'invalid_credentials':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'اسم المستخدم أو البريد أو كلمة المرور غير صحيحة. تحققي من بيانات الدخول.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'auth/too-many-requests': return 'توقفت المحاولات مؤقتًا بسبب تكرارها. انتظري قليلًا ثم أعيدي المحاولة.';
    case 'auth/network-request-failed': return 'تعذر الاتصال بخدمة الدخول. تحققي من الإنترنت ثم أعيدي المحاولة.';
    case 'user_banned':
    case 'auth/user-disabled': return 'هذا الحساب موقوف. تواصلي مع الإدارة.';
    default: return 'تعذر تسجيل الدخول الآن. أعيدي المحاولة أو تواصلي مع الإدارة.';
  }
}
