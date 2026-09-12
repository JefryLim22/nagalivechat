/**
 * Parser user-agent minimalis — cukup untuk menampilkan konteks pengunjung
 * di panel agent tanpa menambah dependency pihak ketiga.
 */
export function parseUserAgent(ua = '') {
  const s = String(ua);

  let browser = 'Unknown';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Chromium/i.test(s)) browser = 'Chromium';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s)) browser = 'Safari';

  const versionMatch = s.match(/(?:Edg|OPR|Chrome|Firefox|Version)\/(\d+)/i);
  if (versionMatch && browser !== 'Unknown') browser += ` ${versionMatch[1]}`;

  let os = 'Unknown';
  if (/Windows NT 10/i.test(s)) os = 'Windows 10/11';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/CrOS/i.test(s)) os = 'ChromeOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let device = 'Desktop';
  if (/iPad|Tablet/i.test(s)) device = 'Tablet';
  else if (/Mobi|Android|iPhone/i.test(s)) device = 'Mobile';

  return { browser, os, device };
}
