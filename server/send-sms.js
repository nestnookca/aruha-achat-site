// Standalone CLI tool to send an SMS blast via Twilio.
// Not exposed as a web endpoint on purpose — an open "send SMS to any
// number" endpoint on the public server would be a spam/abuse risk.
//
// Setup:
//   1. Fill in TWILIO_* values in server/.env (see .env.example) — never
//      commit real credentials.
//   2. npm install (adds twilio + dotenv).
//
// Usage (dry run by default — parses the file and reports counts, sends nothing):
//   node send-sms.js "<message text>" "<path-to.csv>"
//
// Actually sends, once you're sure:
//   node send-sms.js "<message text>" "<path-to.csv>" --send
//
// Optional: --delay-ms=300 to change the pause between sends (default 300ms).

require('dotenv').config();
const fs = require('fs');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER in server/.env');
  process.exit(1);
}

const args = process.argv.slice(2);
const doSend = args.includes('--send');
const delayArg = args.find(a => a.startsWith('--delay-ms='));
const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 300;
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const skipArg = args.find(a => a.startsWith('--skip='));
const skip = skipArg ? Number(skipArg.split('=')[1]) : 0;
const positional = args.filter(a => !a.startsWith('--'));
const [message, csvPath] = positional;

if (!message || !csvPath) {
  console.error('Usage: node send-sms.js "<message text>" "<path-to.csv>" [--send] [--delay-ms=300]');
  process.exit(1);
}

function normalizeIsraeliPhone(raw){
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let e164;
  if (digits.startsWith('972')) e164 = '+' + digits;
  else if (digits.startsWith('0')) e164 = '+972' + digits.slice(1);
  else e164 = '+972' + digits;
  // Israeli mobile: +972 5X XXXXXXX = 9 digits after the country code
  const valid = /^\+9725\d{8}$/.test(e164);
  return { e164, valid };
}

function loadNumbers(path){
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const valid = [];
  const invalid = [];
  for (const line of lines) {
    const raw = line.split(',')[0].trim();
    const { e164, valid: ok } = normalizeIsraeliPhone(raw);
    if (ok) valid.push(e164);
    else invalid.push(raw);
  }
  return { valid, invalid };
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function main(){
  const { valid: allValid, invalid } = loadNumbers(csvPath);
  const afterSkip = skip ? allValid.slice(skip) : allValid;
  const valid = limit ? afterSkip.slice(0, limit) : afterSkip;

  console.log(`נמצאו ${allValid.length} מספרים תקינים בקובץ, ${invalid.length} לא תקינים.${skip ? ` (מדלג על ${skip} הראשונים)` : ''}${limit ? ` (מוגבל ל-${valid.length} בריצה זו)` : ''}`);
  if (invalid.length) {
    console.log('דוגמאות למספרים לא תקינים:', invalid.slice(0, 5).join(', '));
  }
  console.log('דוגמת הודעה:');
  console.log(message);
  console.log(`שולח מהמספר: ${TWILIO_PHONE_NUMBER}`);

  if (!doSend) {
    console.log('\n(זו בדיקה בלבד — שום הודעה לא נשלחה. הריצו שוב עם --send כדי לשלוח בפועל.)');
    return;
  }

  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    readline.question(`\nעומדים לשלוח ${valid.length} הודעות SMS אמיתיות. להמשיך? (כתבו "כן" לאישור): `, resolve);
  });
  readline.close();
  if (answer.trim() !== 'כן') {
    console.log('בוטל.');
    return;
  }

  const twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const results = [];
  let sent = 0, failed = 0;

  for (let i = 0; i < valid.length; i++) {
    const to = valid[i];
    try {
      const msg = await twilioClient.messages.create({ body: message, from: TWILIO_PHONE_NUMBER, to });
      results.push({ to, status: 'sent', sid: msg.sid });
      sent++;
    } catch (err) {
      results.push({ to, status: 'error', error: err.message });
      failed++;
    }
    if ((i + 1) % 50 === 0 || i === valid.length - 1) {
      console.log(`התקדמות: ${i + 1}/${valid.length} (נשלחו: ${sent}, נכשלו: ${failed})`);
    }
    if (i < valid.length - 1) await sleep(delayMs);
  }

  const logPath = `send-log-${Date.now()}.csv`;
  const csvLines = ['to,status,detail', ...results.map(r => `${r.to},${r.status},"${(r.sid || r.error || '').replace(/"/g, '""')}"`)];
  fs.writeFileSync(logPath, csvLines.join('\n'), 'utf8');

  console.log(`\nהושלם. נשלחו בהצלחה: ${sent}, נכשלו: ${failed}. יומן מלא נשמר ב-${logPath}`);
}

main().catch(err => { console.error('שגיאה:', err.message); process.exit(1); });
