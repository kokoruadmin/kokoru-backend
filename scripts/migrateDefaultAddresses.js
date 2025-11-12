require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const User = require('../models/User');

function parseDefaultAddressString(str) {
  if (!str) return {};
  const txt = String(str).trim();
  const lines = txt.split(/\r?\n|,\s*/).map((l) => l.trim()).filter(Boolean);
  const pinMatch = txt.match(/Pincode:\s*(\d{6})/i) || txt.match(/(\d{6})$/);
  const pincode = pinMatch ? pinMatch[1] : '';
  const addressLines = lines.filter((l) => !/Pincode:/i.test(l) && !/\d{6}$/.test(l));

  let mobile = '';
  let alternateMobile = '';
  let email = '';
  let landmark = '';
  let name = '';

  for (const l of lines) {
    const m = l.match(/(Mobile|Phone|Contact|Tel)[:\s]*([0-9\-+ ]{6,})/i);
    if (m && !mobile) mobile = String(m[2]).replace(/\D/g, '').slice(-10);
    const am = l.match(/(Alternate|Alt)[:\s]*([0-9\-+ ]{6,})/i);
    if (am && !alternateMobile) alternateMobile = String(am[2]).replace(/\D/g, '').slice(-10);
    const em = l.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
    if (em && !email) email = em[1];
    if (/Landmark[:\s]/i.test(l) && !landmark) landmark = l.replace(/Landmark[:\s]/i, '').trim();
    if (!name && /^[A-Za-z\s\.]{2,}$/.test(l) && !/\b(Address|Pincode|Pin|Mobile|Phone|Contact|Landmark|Email)\b/i.test(l)) {
      name = l;
    }
  }

  return {
    name: name || '',
    address: addressLines.join(' ') || txt,
    pincode: pincode || '',
    place: '',
    district: '',
    state: '',
    mobile: mobile || '',
    alternateMobile: alternateMobile || '',
    landmark: landmark || '',
    email: email || '',
    label: 'Home',
  };
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function run({ dryRun = true } = {}) {
  const cliMongo = getArg('--mongo');
  const mongoUri = cliMongo || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('No MongoDB connection string provided.');
    console.error('Set MONGO_URI in your environment or pass --mongo "<uri>" on the command line.');
    console.error('Example: node backend/scripts/migrateDefaultAddresses.js --mongo "mongodb://user:pass@host:port/dbname"');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to DB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err && err.message ? err.message : err);
    process.exit(1);
  }

  const users = await User.find({ defaultAddress: { $exists: true, $ne: '' } }).lean();
  console.log(`Found ${users.length} users with legacy defaultAddress`);

  const report = [];

  for (const u of users) {
    try {
      const parsed = parseDefaultAddressString(u.defaultAddress || '');
      // use user.mobile if parsed mobile missing
      if (!parsed.mobile && u.mobile) parsed.mobile = u.mobile;
      if (!parsed.name && u.name) parsed.name = u.name;

      // check if equivalent structured address already exists
      const existing = (u.addresses || []).find((a) => {
        if (!a) return false;
        const addrText = (a.address || '').toString().trim();
        const pin = (a.pincode || '').toString().trim();
        return addrText === (parsed.address || '').toString().trim() && (pin === (parsed.pincode || '').toString().trim());
      });

      if (existing) {
        report.push({ userId: u._id, action: 'exists', message: 'Structured address already present' });
        // clear legacy defaultAddress to avoid duplicates (optional)
        if (!dryRun) {
          await User.updateOne({ _id: u._id }, { $set: { defaultAddress: '' } });
        }
        continue;
      }

      // create new address subdoc
      const newAddr = {
        name: parsed.name || (u.name || ''),
        label: parsed.label || 'Home',
        address: parsed.address || '',
        pincode: parsed.pincode || '',
        mobile: parsed.mobile || '',
        alternateMobile: parsed.alternateMobile || '',
        landmark: parsed.landmark || '',
        email: parsed.email || '',
        place: parsed.place || '',
        district: parsed.district || '',
        state: parsed.state || '',
      };

      report.push({ userId: u._id, action: 'add', address: newAddr });

      if (!dryRun) {
        await User.updateOne({ _id: u._id }, { $push: { addresses: newAddr }, $set: { defaultAddress: '' } });
      }
    } catch (err) {
      console.error('Failed for user', u._id, err);
      report.push({ userId: u._id, action: 'error', error: String(err) });
    }
  }

  const outPath = path.resolve(__dirname, '../../migration-report-defaultAddress.json');
  fs.writeFileSync(outPath, JSON.stringify({ dryRun, count: users.length, items: report }, null, 2));
  console.log(`Report written to ${outPath}`);

  if (!dryRun) console.log('Migration applied (defaultAddress cleared and structured addresses added where needed)');
  else console.log('Dry-run complete (no DB changes made)');

  process.exit(0);
}

const args = process.argv.slice(2);
const dry = args.includes('--apply') ? false : true;

run({ dryRun: dry }).catch((e) => {
  console.error(e);
  process.exit(1);
});
