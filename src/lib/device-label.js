// A user-agent string, read for a human: "Safari on iPhone", "Chrome on
// Mac". The owner dashboard lists sessions and push devices by it, and a
// raw UA is unreadable on a phone (one wrapped line per character). Coarse on purpose: the browser family
// and the device family are all that tell two of one person's devices apart.

const BROWSERS = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
  [/\bcurl\//, 'curl'],
  [/\bWget\b/, 'wget'],
]

const DEVICES = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bMacintosh\b|\bMac OS X\b/, 'Mac'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
]

export function deviceLabel(ua) {
  const s = String(ua || '').trim()
  if (!s) return 'unknown device'
  // Not a browser at all: a script's own name is the label.
  if (!/\bMozilla\//.test(s)) return s.split(/[/ ]/)[0].slice(0, 32) || 'unknown device'
  const browser = (BROWSERS.find(([re]) => re.test(s)) || [])[1]
  const device = (DEVICES.find(([re]) => re.test(s)) || [])[1]
  if (browser && device) return `${browser} on ${device}`
  return browser || device || 'browser'
}
