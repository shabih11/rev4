export const toEnglishNumerals = (str: string | number): string => {
  if (str === null || str === undefined) return '';
  const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(str).split('').map(c => {
    const idx = arabicNumbers.indexOf(c);
    return idx !== -1 ? idx.toString() : c;
  }).join('');
};

export const formatDateTime = (dateStr: string, timeStr: string): string => {
  try {
    const [day, month] = dateStr.split('-');
    const [hourStr, minStr] = timeStr.split(':');
    
    let hour = parseInt(toEnglishNumerals(hourStr), 10);
    const min = parseInt(toEnglishNumerals(minStr), 10);
    
    const ampm = hour >= 12 ? 'م' : 'ص';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    
    const monthsArabic = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    
    const monthName = monthsArabic[parseInt(toEnglishNumerals(month), 10) - 1] || month;
    
    const toArabicNumerals = (num: number | string) => {
      const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return String(num).split('').map(c => arabicNumbers[parseInt(c)] || c).join('');
    };

    const formattedHour = toArabicNumerals(hour);
    const formattedMin = toArabicNumerals(min.toString().padStart(2, '0'));
    const formattedDay = toArabicNumerals(parseInt(day, 10));

    return `(${formattedHour}:${formattedMin} ${ampm} ${formattedDay} ${monthName})`;
  } catch (e) {
    return `(${timeStr} ${dateStr})`;
  }
};

export const parseDateStr = (dateStr: string): Date | null => {
  try {
    const [day, month, year] = dateStr.split('-');
    if (!day || !month || !year) return null;
    return new Date(parseInt(toEnglishNumerals(year), 10), parseInt(toEnglishNumerals(month), 10) - 1, parseInt(toEnglishNumerals(day), 10));
  } catch {
    return null;
  }
};

export const isWithinLastDays = (dateStr: string, days: number): boolean => {
  const date = parseDateStr(dateStr);
  if (!date) return false;
  
  // Use current date for the app context, or a fixed reference if testing
  const now = new Date();
  
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays <= days;
};
