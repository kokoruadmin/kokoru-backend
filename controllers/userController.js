const User = require("../models/User");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";

// Middleware: verify JWT
// Middleware: verify JWT and attach full user
exports.authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // ✅ Fetch full user from DB
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Attach to request
    req.userId = decoded.id; // backward-compatibility
    req.user = user;         // new version (full user object)

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};


// 🟣 Get all saved addresses for user
// controllers/userController.js
// ✅ Middleware already exists in your setup: authMiddleware

exports.getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("defaultAddress addresses name email mobile");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Combine default address with saved addresses
    const allAddresses = [];

  if (user.defaultAddress) {
      // try to parse pincode if stored in the defaultAddress string (format: '...\nPincode: 123456')
      let parsed = { address: user.defaultAddress, pincode: "", place: "", district: "", state: "" };
      try {
        const lines = String(user.defaultAddress || "").split(/\r?\n/).map((l) => l.trim());
        for (const ln of lines) {
          const m = ln.match(/Pincode:\s*(\d{3,6})/i);
          if (m) parsed.pincode = m[1];
        }
        parsed.address = lines.filter((l) => !/Pincode:/i.test(l)).join(" ");
      } catch (e) {}

      allAddresses.push({
        _id: "default",
        label: "Default",
        address: parsed.address,
        pincode: parsed.pincode,
        place: parsed.place,
        district: parsed.district,
        state: parsed.state,
        mobile: parsed.mobile || user.mobile || "",
        alternateMobile: parsed.alternateMobile || "",
        landmark: parsed.landmark || "",
        email: parsed.email || user.email || "",
        name: parsed.name || user.name || "",
        isDefault: true,
      });
    }

    if (user.addresses && Array.isArray(user.addresses)) {
      user.addresses.forEach((addr) => allAddresses.push(addr));
    }

    res.json(allAddresses);
  } catch (err) {
    console.error("❌ Error fetching addresses:", err);
    res.status(500).json({ message: "Failed to fetch addresses" });
  }
};



// 🟣 Add a new address
exports.addAddress = async (req, res) => {
  try {
    const { label, address } = req.body;
    // Expect `address` to be an object with at least: address (string), pincode (string/number), mobile (string)
    if (!address || typeof address !== "object")
      return res.status(400).json({ message: "Address payload must be an object" });

    const { address: addrText, pincode, mobile, alternateMobile, landmark, email, name } = address;
    if (!addrText || !String(addrText).trim())
      return res.status(400).json({ message: "Address text is required" });

    // stricter pincode validation - accept exactly 6 digits
    const pin = String(pincode || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(pin))
      return res.status(400).json({ message: "Pincode must be 6 digits" });

    // mobile can be provided or fallback to user's mobile if available
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

  const mobileToSave = mobile || user.mobile;
  if (!mobileToSave) return res.status(400).json({ message: "Contact/mobile number is required" });
  const mobileDigits = String(mobileToSave).replace(/\D/g, '');
  if (mobileDigits.length !== 10) return res.status(400).json({ message: "Mobile number must be 10 digits" });

    // build address object storing supplied fields
    const toSave = {
      name: name || address.name || user.name || '',
      label: label || "Other",
      address: addrText,
      pincode: pin,
      mobile: mobileDigits,
      alternateMobile: String(alternateMobile || address.alternateMobile || '').replace(/\D/g, '') || '',
      landmark: landmark || address.landmark || '',
      email: email || address.email || user.email || '',
      place: address.place || "",
      district: address.district || "",
      state: address.state || "",
    };

    // push as subdocument so Mongoose will assign an _id
    user.addresses.push(toSave);
    await user.save();
    res.json({ message: "Address added successfully", addresses: user.addresses });
  } catch (err) {
    console.error("❌ addAddress error:", err);
    res.status(500).json({ message: err.message });
  }
};

// 🟣 Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user?.id || req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // If client wants to remove the legacy default address
    if (id === "default") {
      user.defaultAddress = "";
      await user.save();
      return res.json({ message: "Default address removed", addresses: user.addresses });
    }
    // addresses array may contain objects or raw strings (legacy). Be defensive.
    const beforeCount = (user.addresses || []).length;
    const filtered = (user.addresses || []).filter((addr) => {
      try {
        if (!addr) return false;
        if (typeof addr === "string") {
          // if stored as raw string, compare directly
          return String(addr) !== String(id);
        }
        // object form: compare _id if present, otherwise try address text
        if (addr._id) return String(addr._id) !== String(id);
        if (addr.address) return String(addr.address) !== String(id);
        return true;
      } catch (e) {
        return true;
      }
    });

    // If nothing was removed by direct id match, try to use request body hints
    if (filtered.length === beforeCount) {
      // attempt fallback matching using provided address text / pincode / mobile
      const { addressText, pincode, mobile } = req.body || {};
      if (addressText) {
        const normalizedText = String(addressText).trim();
        const matchIndex = (user.addresses || []).findIndex((a) => {
          if (!a || typeof a === 'string') return false;
          try {
            const sameText = String(a.address || '').trim() === normalizedText;
            const samePin = pincode ? String(a.pincode || '').trim() === String(pincode).trim() : true;
            const sameMobile = mobile ? String(a.mobile || '').trim() === String(mobile).trim() : true;
            return sameText && samePin && sameMobile;
          } catch (e) {
            return false;
          }
        });

        if (matchIndex !== -1) {
          // remove the matched entry
          user.addresses.splice(matchIndex, 1);
          await user.save();
          return res.json({ message: 'Address removed', addresses: user.addresses });
        }
      }

      // helpful debug - in dev we return available ids so client can report
      try {
        const ids = (user.addresses || []).map((a) => (a && a._id ? String(a._id) : (a && a.address) || String(a)));
        console.warn('[deleteAddress] address id not found', { requestedId: id, available: ids });
        return res.status(404).json({ message: 'Address not found', requestedId: id, available: ids });
      } catch (e) {
        return res.status(404).json({ message: 'Address not found' });
      }
    }

    user.addresses = filtered;
    await user.save();
    res.json({ message: "Address removed", addresses: user.addresses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🟣 Update an existing address
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, address } = req.body;
    if (!address || typeof address !== 'object')
      return res.status(400).json({ message: 'Address payload must be an object' });

    const user = await User.findById(req.user?.id || req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Try to find by _id first. If not present (legacy data), try matching by address text.
    let idx = user.addresses.findIndex((a) => a && a._id && String(a._id) === String(id));
    if (idx === -1) {
      idx = user.addresses.findIndex((a) => a && a.address && String(a.address) === String(id));
    }
    // support legacy entries stored as raw strings
    if (idx === -1) {
      idx = user.addresses.findIndex((a) => typeof a === 'string' && String(a) === String(id));
    }
    if (idx === -1) {
      // helpful debug - in dev we return available ids so client can report
      try {
        const ids = (user.addresses || []).map((a) => (a && a._id ? String(a._id) : (a && a.address) || String(a)));
        console.warn('[updateAddress] address id not found', { requestedId: id, available: ids });
        return res.status(404).json({ message: 'Address not found', requestedId: id, available: ids });
      } catch (e) {
        return res.status(404).json({ message: 'Address not found' });
      }
    }

    // validate pincode/mobile
    if (!address.address || !String(address.address).trim())
      return res.status(400).json({ message: 'Address text is required' });
    const pin = String(address.pincode || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ message: 'Pincode must be 6 digits' });
    const mobileToSave = address.mobile || user.mobile;
    if (!mobileToSave) return res.status(400).json({ message: 'Contact/mobile number is required' });
    const mobileDigits = String(mobileToSave).replace(/\D/g, '');
    if (mobileDigits.length !== 10) return res.status(400).json({ message: 'Mobile number must be 10 digits' });

    // update fields
    // preserve existing _id and merge fields
    const existing = user.addresses[idx] && user.addresses[idx].toObject ? user.addresses[idx].toObject() : (typeof user.addresses[idx] === 'string' ? {} : user.addresses[idx]) || {};
    user.addresses[idx] = {
      ...existing,
      name: address.name || existing.name || user.name || '',
      label: label || existing.label || 'Other',
      address: address.address,
      pincode: pin,
      mobile: mobileDigits,
      alternateMobile: String(address.alternateMobile || existing.alternateMobile || '').replace(/\D/g, ''),
      landmark: address.landmark || existing.landmark || '',
      email: address.email || existing.email || user.email || '',
      place: address.place || existing.place || '',
      district: address.district || existing.district || '',
      state: address.state || existing.state || '',
    };

    await user.save();
    res.json({ message: 'Address updated', addresses: user.addresses });
  } catch (err) {
    console.error('❌ updateAddress error:', err);
    res.status(500).json({ message: err.message });
  }
};

// 🟣 Validate an address object (or existing address by id) for required fields
exports.validateAddress = async (req, res) => {
  try {
    const { address, addressId } = req.body;
    let addr = address;

    // If addressId provided, resolve from DB
    if (addressId) {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const found = (user.addresses || []).find((a) => String(a._id) === String(addressId));
      addr = found || addr;
    }

    const missing = [];
    if (!addr || typeof addr !== 'object') {
      missing.push('address');
    } else {
      if (!addr.address || !String(addr.address).trim()) missing.push('address_text');
      const pin = String(addr.pincode || '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(pin)) missing.push('pincode');
      const mobileCandidate = String(addr.mobile || req.user?.mobile || '');
      const mobileDigits = mobileCandidate.replace(/\D/g, '');
      if (mobileDigits.length !== 10) missing.push('mobile');
    }

    res.json({ ok: missing.length === 0, missingFields: missing });
  } catch (err) {
    console.error('❌ validateAddress error:', err);
    res.status(500).json({ message: 'Failed to validate address' });
  }
};

// 🟣 Normalize legacy addresses (convert raw string entries to subdocuments)
exports.normalizeAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id || req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const normalized = (user.addresses || []).map((a) => {
      if (!a) return null;
      if (typeof a === 'string') {
        return {
          name: user.name || '',
          label: 'Other',
          address: a,
          pincode: '',
          mobile: user.mobile || '',
          alternateMobile: '',
          landmark: '',
          email: user.email || '',
          place: '',
          district: '',
          state: '',
        };
      }
      // already an object: ensure required fields exist
      return {
        name: a.name || user.name || '',
        label: a.label || 'Other',
        address: a.address || '',
        pincode: a.pincode || '',
        mobile: a.mobile || user.mobile || '',
        alternateMobile: a.alternateMobile || '',
        landmark: a.landmark || '',
        email: a.email || user.email || '',
        place: a.place || '',
        district: a.district || '',
        state: a.state || '',
      };
    }).filter(Boolean);

    // replace addresses and save so Mongoose assigns _id to each
    user.addresses = normalized;
    await user.save();
    return res.json({ message: 'Addresses normalized', addresses: user.addresses });
  } catch (err) {
    console.error('❌ normalizeAddresses error:', err);
    return res.status(500).json({ message: 'Failed to normalize addresses' });
  }
};

// 🟣 Set an existing saved address as the user's defaultAddress
exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user?.id || req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!id) return res.status(400).json({ message: 'Address id required' });

    // support special 'default' id which clears the defaultAddress
    if (String(id) === 'default') {
      user.defaultAddress = '';
      await user.save();
      return res.json({ message: 'Default address cleared', defaultAddress: user.defaultAddress });
    }

    // find address by _id
    const found = (user.addresses || []).find((a) => a && a._id && String(a._id) === String(id));
    if (!found) return res.status(404).json({ message: 'Address not found' });

    // Use a concise, human-readable defaultAddress string (address + pincode if present)
    const addrStr = (String(found.address || '').trim() + (found.pincode ? `\nPincode: ${String(found.pincode).trim()}` : '')).trim();
    user.defaultAddress = addrStr;
    await user.save();

    return res.json({ message: 'Default address set', defaultAddress: user.defaultAddress });
  } catch (err) {
    console.error('❌ setDefaultAddress error:', err);
    return res.status(500).json({ message: 'Failed to set default address' });
  }
};
