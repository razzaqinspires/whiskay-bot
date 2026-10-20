/**
 * @file freply.js
 * Comprehensive WhatsApp Fake Reply System (Historical 2019 - 2026)
 * Provides fake quoted messages and contextInfo for all WhatsApp bot eras.
 */

const crypto = require('crypto');

/**
 * Valid 1x1 pixel JPEG placeholder thumbnail buffer
 * @type {Buffer}
 */
const DEFAULT_JPEG_THUMBNAIL = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07,
  0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F,
  0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C,
  0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D,
  0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F,
  0x00, 0xFF, 0xD9
]);

/**
 * Standard PNG thumbnail buffer for stickers
 * @readonly
 * @type {Buffer}
 */
const DEFAULT_PNG_THUMBNAIL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAPUlEQVR42u3OMQEAAAgDINc/9K3hCREg1b10QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkICXwb/xQE1dM8p9QAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Standard simulated audio waveform buffer for voice notes
 * @readonly
 * @type {Buffer}
 */
const DEFAULT_AUDIO_WAVEFORM = Buffer.from([
  0, 4, 12, 28, 45, 60, 42, 25, 10, 5, 2, 8, 20, 38, 55, 64, 48, 30, 15, 6, 2, 10, 24, 45, 58, 40, 22, 12, 5, 0, 8, 18, 32, 20, 8, 0
]);

/**
 * Generates a deterministic SHA256 buffer for media placeholders
 * @param {string} seed
 * @returns {Buffer}
 */
function generateHashBuffer(seed) {
  return crypto.createHash('sha256').update(String(seed)).digest();
}

/**
 * Generates a random Baileys message identifier
 * @param {string} [prefix='BAE5']
 * @returns {string}
 */
function generateFakeId(prefix = 'BAE5') {
  return prefix + crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Historical eras catalog representing WhatsApp bot evolution
 * @readonly
 * @enum {object}
 */
const ERAS = Object.freeze({
  ERA_2019_2020: {
    id: 'era_2019_2020',
    years: '2019 - 2020',
    name: 'Classic WhatsApp Web Legacy Era',
    description: 'Early reverse-engineered WhatsApp Web protocol, vCard contacts, plain text, and basic media quotes.',
    types: ['text', 'contact', 'contactsArray', 'location', 'liveLocation', 'document', 'audio', 'image', 'video', 'gif']
  },
  ERA_2021_2022: {
    id: 'era_2021_2022',
    years: '2021 - 2022',
    name: 'Multi-Device Golden Era',
    description: 'Multi-Device protocol transition, viral shopping trolley orders, catalog products, status stories, and payment requests.',
    types: ['trolley', 'product', 'order', 'status', 'payment', 'groupInvite', 'sticker']
  },
  ERA_2023_2024: {
    id: 'era_2023_2024',
    years: '2023 - 2024',
    name: 'Channels and Interactive Era',
    description: 'WhatsApp Channels newsletters, interactive native flow cards, community polls, and scheduled events.',
    types: ['newsletter', 'poll', 'interactive', 'event', 'call']
  },
  ERA_2025_2026: {
    id: 'era_2025_2026',
    years: '2025 - 2026',
    name: 'Artificial Intelligence and Next-Gen Era',
    description: 'Meta AI integration, pinned messages, view once media quotes, and bot-forwarded envelopes.',
    types: ['metaAi', 'pinned', 'viewOnce', 'botForwarded']
  }
});

/**
 * Verified organization and persona profiles
 * @readonly
 * @enum {object}
 */
const PERSONAS = Object.freeze({
  whatsappSupport: {
    name: 'WhatsApp Official Support',
    number: '0',
    jid: '0@s.whatsapp.net',
    org: 'WhatsApp Inc.',
    verified: true
  },
  metaAi: {
    name: 'Meta AI',
    number: '13135550002',
    jid: '13135550002@s.whatsapp.net',
    org: 'Meta Platforms Inc.',
    verified: true
  },
  verifiedBusiness: {
    name: 'Verified Business Service',
    number: '18005550100',
    jid: '18005550100@s.whatsapp.net',
    org: 'Enterprise Verified',
    verified: true
  },
  google: {
    name: 'Google Official',
    number: '16502530000',
    jid: '16502530000@s.whatsapp.net',
    org: 'Google LLC',
    verified: true
  },
  github: {
    name: 'GitHub System',
    number: '14158000000',
    jid: '14158000000@s.whatsapp.net',
    org: 'GitHub Inc.',
    verified: true
  },
  spotify: {
    name: 'Spotify Music',
    number: '18007768439',
    jid: '18007768439@s.whatsapp.net',
    org: 'Spotify AB',
    verified: true
  },
  youtube: {
    name: 'YouTube Official',
    number: '16506530000',
    jid: '16506530000@s.whatsapp.net',
    org: 'YouTube LLC',
    verified: true
  },
  nasa: {
    name: 'NASA Space Operations',
    number: '12023580000',
    jid: '12023580000@s.whatsapp.net',
    org: 'National Aeronautics and Space Administration',
    verified: true
  },
  paymentGateway: {
    name: 'WhatsApp Payment Gateway',
    number: '18005550199',
    jid: '18005550199@s.whatsapp.net',
    org: 'WhatsApp Payments Network',
    verified: true
  }
});

/**
 * Formats a standard vCard string
 * @param {string} name
 * @param {string} phone
 * @param {string} [org='WhatsApp User']
 * @returns {string}
 */
function formatVCard(name, phone, org = 'WhatsApp User') {
  const cleanNumber = String(phone).replace(/[^0-9]/g, '');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${name};;;`,
    `FN:${name}`,
    `ORG:${org};`,
    `TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}`,
    'END:VCARD'
  ].join('\n');
}

/**
 * Resolves standard base key parameters for a fake quoted message
 * @param {object} [options={}]
 * @returns {object}
 */
function resolveBaseKey(options = {}) {
  const remoteJid = options.remoteJid || options.chat || '0@s.whatsapp.net';
  const participant = options.participant || options.sender || (options.fromMe ? undefined : '0@s.whatsapp.net');
  const fromMe = Boolean(options.fromMe);
  const id = options.id || options.stanzaId || generateFakeId();

  return {
    remoteJid,
    fromMe,
    id,
    participant
  };
}

/**
 * Creates a fake conversation or text reply (Era 2019)
 * @param {string} [text='Hello from WhatsApp!']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeText(text = 'Hello from WhatsApp!', options = {}) {
  const key = resolveBaseKey(options);
  return {
    key,
    message: {
      conversation: text
    }
  };
}

/**
 * Creates a fake contact vCard reply (Era 2019 - Classic fkon)
 * @param {string} [name='WhatsApp Support']
 * @param {string} [number='0']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeContact(name = 'WhatsApp Support', number = '0', options = {}) {
  const key = resolveBaseKey({
    participant: options.participant || `${number}@s.whatsapp.net`,
    ...options
  });
  const org = options.org || 'WhatsApp Inc.';
  const vcard = options.vcard || formatVCard(name, number, org);

  return {
    key,
    message: {
      contactMessage: {
        displayName: name,
        vcard
      }
    }
  };
}

/**
 * Creates a fake multiple contacts array reply (Era 2019)
 * @param {Array<object>} [contacts=[]]
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeContactsArray(contacts = [], options = {}) {
  const key = resolveBaseKey(options);
  const displayName = options.displayName || 'Contacts Catalog';
  const contactsList = contacts.length > 0 ? contacts : [
    { displayName: 'WhatsApp Support', vcard: formatVCard('WhatsApp Support', '0', 'WhatsApp Inc.') },
    { displayName: 'Meta AI Assistant', vcard: formatVCard('Meta AI', '13135550002', 'Meta Platforms') }
  ];

  return {
    key,
    message: {
      contactsArrayMessage: {
        displayName,
        contacts: contactsList
      }
    }
  };
}

/**
 * Creates a fake shopping trolley order reply (Era 2021 - Iconic ftroli)
 * @param {string} [title='Official Store Order']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeTrolley(title = 'Official Store Order', options = {}) {
  const key = resolveBaseKey({
    participant: options.participant || '0@s.whatsapp.net',
    ...options
  });
  const thumbnail = options.thumbnail || options.jpegThumbnail || DEFAULT_JPEG_THUMBNAIL;
  const itemCount = typeof options.itemCount === 'number' ? options.itemCount : 999;
  const status = typeof options.status === 'number' ? options.status : 1;
  const surface = typeof options.surface === 'number' ? options.surface : 1;
  const message = options.message || options.text || title;
  const orderTitle = options.orderTitle || title;
  const sellerJid = options.sellerJid || '0@s.whatsapp.net';
  const token = options.token || 'AR6kX8qL' + crypto.randomBytes(6).toString('hex');
  const totalAmount1000 = String(options.totalAmount1000 || '1000000');
  const totalCurrencyCode = options.currency || options.totalCurrencyCode || 'IDR';

  return {
    key,
    message: {
      orderMessage: {
        orderId: options.orderId || 'ORD-' + Date.now(),
        thumbnail,
        itemCount,
        status,
        surface,
        message,
        orderTitle,
        sellerJid,
        token,
        totalAmount1000,
        totalCurrencyCode
      }
    }
  };
}

/**
 * Creates a fake product catalog reply (Era 2021)
 * @param {string} [title='Premium Item']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeProduct(title = 'Premium Item', options = {}) {
  const key = resolveBaseKey({
    participant: options.participant || '0@s.whatsapp.net',
    ...options
  });
  const thumbnail = options.thumbnail || options.jpegThumbnail || DEFAULT_JPEG_THUMBNAIL;

  return {
    key,
    message: {
      productMessage: {
        product: {
          productImage: {
            mimetype: 'image/jpeg',
            jpegThumbnail: thumbnail
          },
          productId: options.productId || 'PROD-' + Date.now(),
          title,
          description: options.description || 'Verified product catalog listing.',
          currencyCode: options.currency || 'USD',
          priceAmount1000: String(options.priceAmount1000 || '99000'),
          retailerId: options.retailerId || 'RETAIL-' + Date.now(),
          url: options.url || 'https:' + String.fromCharCode(47, 47) + 'www.whatsapp.com',
          productImageCount: 1
        },
        businessOwnerJid: options.businessOwnerJid || '0@s.whatsapp.net'
      }
    }
  };
}

/**
 * Creates a fake document reply (Era 2019 - fdoc)
 * @param {string} [fileName='Document.pdf']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeDocument(fileName = 'Document.pdf', options = {}) {
  const key = resolveBaseKey(options);
  const thumbnail = options.thumbnail || options.jpegThumbnail || DEFAULT_JPEG_THUMBNAIL;

  return {
    key,
    message: {
      documentMessage: {
        url: '',
        mimetype: options.mimetype || 'application/pdf',
        title: options.title || fileName,
        fileSha256: Buffer.from([]),
        fileLength: String(options.fileLength || '1048576'),
        pageCount: typeof options.pageCount === 'number' ? options.pageCount : 100,
        mediaKey: Buffer.from([]),
        fileName,
        fileEncSha256: Buffer.from([]),
        directPath: '',
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        jpegThumbnail: thumbnail
      }
    }
  };
}

/**
 * Creates a fake audio voice note reply (Era 2019 - fvn)
 * @param {string|object} [captionOrOptions='Voice Note']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeAudio(captionOrOptions = 'Voice Note', options = {}) {
  let opts = {};
  if (typeof captionOrOptions === 'object' && captionOrOptions !== null) {
    opts = { ...captionOrOptions, ...options };
  } else {
    opts = { ...options };
    if (typeof captionOrOptions === 'string') opts.text = captionOrOptions;
  }
  const key = resolveBaseKey(opts);
  const seconds = typeof opts.seconds === 'number' ? opts.seconds : 30;
  const ptt = opts.ptt !== undefined ? Boolean(opts.ptt) : true;

  return {
    key,
    message: {
      audioMessage: {
        url: 'https:' + String.fromCharCode(47, 47) + 'mmg.whatsapp.net/v/t62.7114-24/fake_audio.enc',
        mimetype: opts.mimetype || 'audio/ogg; codecs=opus',
        fileSha256: generateHashBuffer(key.id + '_sha'),
        fileLength: String(opts.fileLength || '102400'),
        seconds,
        ptt,
        mediaKey: generateHashBuffer(key.id + '_key'),
        fileEncSha256: generateHashBuffer(key.id + '_enc'),
        directPath: '/v/t62.7114-24/fake_audio.enc',
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        waveform: DEFAULT_AUDIO_WAVEFORM
      }
    }
  };
}

/**
 * Creates a fake image reply (Era 2019 - fimg)
 * @param {string|object} [captionOrOptions='Photo Snapshot']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeImage(captionOrOptions = 'Photo Snapshot', options = {}) {
  let opts = {};
  let caption = 'Photo Snapshot';
  if (typeof captionOrOptions === 'object' && captionOrOptions !== null) {
    opts = { ...captionOrOptions, ...options };
    caption = opts.caption || opts.text || 'Photo Snapshot';
  } else {
    opts = { ...options };
    caption = typeof captionOrOptions === 'string' ? captionOrOptions : (opts.caption || opts.text || 'Photo Snapshot');
  }
  const key = resolveBaseKey(opts);
  const thumbnail = Buffer.isBuffer(opts.thumbnail) ? opts.thumbnail : (Buffer.isBuffer(opts.jpegThumbnail) ? opts.jpegThumbnail : DEFAULT_JPEG_THUMBNAIL);

  return {
    key,
    message: {
      imageMessage: {
        url: 'https:' + String.fromCharCode(47, 47) + 'mmg.whatsapp.net/v/t62.7114-24/fake_image.enc',
        mimetype: opts.mimetype || 'image/jpeg',
        caption: String(caption),
        fileSha256: generateHashBuffer(key.id + '_sha'),
        fileLength: String(opts.fileLength || '204800'),
        height: typeof opts.height === 'number' ? opts.height : 720,
        width: typeof opts.width === 'number' ? opts.width : 1280,
        mediaKey: generateHashBuffer(key.id + '_key'),
        fileEncSha256: generateHashBuffer(key.id + '_enc'),
        directPath: '/v/t62.7114-24/fake_image.enc',
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        jpegThumbnail: thumbnail
      }
    }
  };
}

/**
 * Creates a fake video reply (Era 2019 - fvideo)
 * @param {string|object} [captionOrOptions='Video Clip']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeVideo(captionOrOptions = 'Video Clip', options = {}) {
  let opts = {};
  let caption = 'Video Clip';
  if (typeof captionOrOptions === 'object' && captionOrOptions !== null) {
    opts = { ...captionOrOptions, ...options };
    caption = opts.caption || opts.text || 'Video Clip';
  } else {
    opts = { ...options };
    caption = typeof captionOrOptions === 'string' ? captionOrOptions : (opts.caption || opts.text || 'Video Clip');
  }
  const key = resolveBaseKey(opts);
  const thumbnail = Buffer.isBuffer(opts.thumbnail) ? opts.thumbnail : (Buffer.isBuffer(opts.jpegThumbnail) ? opts.jpegThumbnail : DEFAULT_JPEG_THUMBNAIL);

  return {
    key,
    message: {
      videoMessage: {
        url: 'https:' + String.fromCharCode(47, 47) + 'mmg.whatsapp.net/v/t62.7114-24/fake_video.enc',
        mimetype: opts.mimetype || 'video/mp4',
        caption: String(caption),
        fileSha256: generateHashBuffer(key.id + '_sha'),
        fileLength: String(opts.fileLength || '1048576'),
        seconds: typeof opts.seconds === 'number' ? opts.seconds : 30,
        mediaKey: generateHashBuffer(key.id + '_key'),
        fileEncSha256: generateHashBuffer(key.id + '_enc'),
        directPath: '/v/t62.7114-24/fake_video.enc',
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        jpegThumbnail: thumbnail,
        gifPlayback: false
      }
    }
  };
}

/**
 * Creates a fake animated GIF reply (Era 2019 - fgif)
 * @param {string|object} [captionOrOptions='Animated GIF']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeGif(captionOrOptions = 'Animated GIF', options = {}) {
  let opts = {};
  let caption = 'Animated GIF';
  if (typeof captionOrOptions === 'object' && captionOrOptions !== null) {
    opts = { ...captionOrOptions, ...options };
    caption = opts.caption || opts.text || 'Animated GIF';
  } else {
    opts = { ...options };
    caption = typeof captionOrOptions === 'string' ? captionOrOptions : (opts.caption || opts.text || 'Animated GIF');
  }
  const key = resolveBaseKey(opts);
  const thumbnail = Buffer.isBuffer(opts.thumbnail) ? opts.thumbnail : (Buffer.isBuffer(opts.jpegThumbnail) ? opts.jpegThumbnail : DEFAULT_JPEG_THUMBNAIL);

  return {
    key,
    message: {
      videoMessage: {
        url: 'https:' + String.fromCharCode(47, 47) + 'mmg.whatsapp.net/v/t62.7114-24/fake_gif.enc',
        mimetype: opts.mimetype || 'video/mp4',
        caption: String(caption),
        fileSha256: generateHashBuffer(key.id + '_sha'),
        fileLength: String(opts.fileLength || '524288'),
        seconds: typeof opts.seconds === 'number' ? opts.seconds : 5,
        mediaKey: generateHashBuffer(key.id + '_key'),
        fileEncSha256: generateHashBuffer(key.id + '_enc'),
        directPath: '/v/t62.7114-24/fake_gif.enc',
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        jpegThumbnail: thumbnail,
        gifPlayback: true,
        gifAttribution: 1
      }
    }
  };
}

/**
 * Creates a fake location reply (Era 2019 - floc)
 * @param {string} [name='Silicon Valley HQ']
 * @param {string} [address='1 Hacker Way, Menlo Park, CA']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeLocation(name = 'Silicon Valley HQ', address = '1 Hacker Way, Menlo Park, CA', options = {}) {
  const key = resolveBaseKey(options);
  const thumbnail = options.thumbnail || options.jpegThumbnail || DEFAULT_JPEG_THUMBNAIL;

  return {
    key,
    message: {
      locationMessage: {
        degreesLatitude: typeof options.latitude === 'number' ? options.latitude : 37.4848,
        degreesLongitude: typeof options.longitude === 'number' ? options.longitude : -122.1484,
        name,
        address,
        jpegThumbnail: thumbnail
      }
    }
  };
}

/**
 * Creates a fake live location reply (Era 2019 - flive)
 * @param {string} [caption='Realtime Navigation Active']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeLiveLocation(caption = 'Realtime Navigation Active', options = {}) {
  const key = resolveBaseKey(options);
  const thumbnail = options.thumbnail || options.jpegThumbnail || DEFAULT_JPEG_THUMBNAIL;

  return {
    key,
    message: {
      liveLocationMessage: {
        degreesLatitude: typeof options.latitude === 'number' ? options.latitude : 37.4848,
        degreesLongitude: typeof options.longitude === 'number' ? options.longitude : -122.1484,
        caption,
        sequenceNumber: 1,
        timeOffset: 0,
        jpegThumbnail: thumbnail
      }
    }
  };
}

/**
 * Creates a fake status story reply (Era 2021 - fstatus / fsw)
 * @param {string} [text='Replying to WhatsApp Status']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeStatus(text = 'Replying to WhatsApp Status', options = {}) {
  const participant = options.participant || options.sender || '0@s.whatsapp.net';
  const key = {
    remoteJid: 'status@broadcast',
    fromMe: false,
    id: options.id || generateFakeId(),
    participant
  };

  return {
    key,
    message: {
      conversation: text
    }
  };
}

/**
 * Creates a fake payment request reply (Era 2021 - fpay)
 * @param {string} [amount1000='1000000']
 * @param {string} [currency='USD']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakePayment(amount1000 = '1000000', currency = 'USD', options = {}) {
  const participant = options.participant || options.sender || '0@s.whatsapp.net';
  const key = resolveBaseKey({ participant, ...options });

  return {
    key,
    message: {
      requestPaymentMessage: {
        currencyCodeIso4217: currency,
        amount1000: String(amount1000),
        requestFrom: participant,
        noteMessage: {
          extendedTextMessage: {
            text: options.note || 'Payment Request'
          }
        },
        expiryTimestamp: String(Math.floor(Date.now() / 1000) + 86400)
      }
    }
  };
}

/**
 * Creates a fake group invitation reply (Era 2021 - finvite)
 * @param {string} [groupName='Official Community Group']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeGroupInvite(groupName = 'Official Community Group', options = {}) {
  const key = resolveBaseKey(options);
  const thumbnail = options.thumbnail || options.jpegThumbnail || DEFAULT_JPEG_THUMBNAIL;

  return {
    key,
    message: {
      groupInviteMessage: {
        groupJid: options.groupJid || '120363000000000000@g.us',
        groupName,
        inviteCode: options.inviteCode || 'ZETTAI' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        inviteExpiration: String(Math.floor(Date.now() / 1000) + 259200),
        caption: options.caption || 'Join the official group community.',
        jpegThumbnail: thumbnail
      }
    }
  };
}

/**
 * Creates a fake sticker reply (Era 2021 - fsticker)
 * @param {object|string} [textOrOptions={}]
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeSticker(textOrOptions = {}, options = {}) {
  let opts = {};
  if (typeof textOrOptions === 'object' && textOrOptions !== null) {
    opts = { ...textOrOptions, ...options };
  } else {
    opts = { ...options };
    if (typeof textOrOptions === 'string') opts.text = textOrOptions;
  }
  const key = resolveBaseKey(opts);

  return {
    key,
    message: {
      stickerMessage: {
        url: 'https:' + String.fromCharCode(47, 47) + 'mmg.whatsapp.net/v/t62.7114-24/fake_sticker.enc',
        fileSha256: generateHashBuffer(key.id + '_sha'),
        fileEncSha256: generateHashBuffer(key.id + '_enc'),
        mediaKey: generateHashBuffer(key.id + '_key'),
        mimetype: opts.mimetype || 'image/webp',
        height: 512,
        width: 512,
        directPath: '/v/t62.7114-24/fake_sticker.enc',
        fileLength: String(opts.fileLength || '65536'),
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        isAnimated: Boolean(opts.isAnimated),
        isAvatar: Boolean(opts.isAvatar),
        pngThumbnail: DEFAULT_PNG_THUMBNAIL
      }
    }
  };
}

/**
 * Creates a fake poll creation reply (Era 2023 - fpoll)
 * @param {string} [question='Select your favorite option']
 * @param {Array<string>} [optionsList=['Option A', 'Option B', 'Option C']]
 * @param {object} [options={}]
 * @returns {object}
 */
function fakePoll(question = 'Select your favorite option', optionsList = ['Option A', 'Option B', 'Option C'], options = {}) {
  const key = resolveBaseKey(options);
  const formattedOptions = optionsList.map((opt) => ({ optionName: typeof opt === 'string' ? opt : opt.optionName || 'Option' }));

  return {
    key,
    message: {
      pollCreationMessage: {
        name: question,
        options: formattedOptions,
        selectableOptionsCount: typeof options.selectableCount === 'number' ? options.selectableCount : 1
      }
    }
  };
}

/**
 * Creates a fake WhatsApp newsletter / channel reply (Era 2023 - fnewsletter / fchannel)
 * @param {string} [channelName='WhatsApp Official Channel']
 * @param {string} [text='Broadcast update from verified channel.']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeNewsletter(channelName = 'WhatsApp Official Channel', text = 'Broadcast update from verified channel.', options = {}) {
  const newsletterJid = options.newsletterJid || '120363161515064500@newsletter';
  const serverMessageId = typeof options.serverMessageId === 'number' ? options.serverMessageId : 100;

  const key = {
    remoteJid: newsletterJid,
    fromMe: false,
    id: options.id || generateFakeId(),
    participant: options.participant || newsletterJid
  };

  return {
    key,
    message: {
      extendedTextMessage: {
        text,
        contextInfo: {
          forwardedNewsletterMessageInfo: {
            newsletterJid,
            newsletterName: channelName,
            serverMessageId
          }
        }
      }
    }
  };
}

/**
 * Creates a fake interactive native flow card reply (Era 2023 - finteractive)
 * @param {string|object} [titleOrOptions='Interactive Action']
 * @param {string|object} [bodyOrOptions='Please review the information below.']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeInteractive(titleOrOptions = 'Interactive Action', bodyOrOptions = 'Please review the information below.', options = {}) {
  let opts = {};
  let title = 'Interactive Action';
  let body = 'Please review the information below.';
  if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
    opts = { ...titleOrOptions, ...options };
    title = opts.title || opts.text || 'Interactive Action';
    body = opts.body || opts.message || opts.text || 'Please review the information below.';
  } else if (typeof bodyOrOptions === 'object' && bodyOrOptions !== null) {
    opts = { ...bodyOrOptions, ...options };
    title = typeof titleOrOptions === 'string' ? titleOrOptions : (opts.title || 'Interactive Action');
    body = opts.body || opts.text || 'Please review the information below.';
  } else {
    opts = { ...options };
    title = typeof titleOrOptions === 'string' ? titleOrOptions : 'Interactive Action';
    body = typeof bodyOrOptions === 'string' ? bodyOrOptions : 'Please review the information below.';
  }
  const key = resolveBaseKey(opts);

  return {
    key,
    message: {
      interactiveMessage: {
        header: {
          title: String(opts.title || title || 'Interactive Action'),
          subtitle: String(opts.subtitle || ''),
          hasMediaAttachment: false
        },
        body: {
          text: String(opts.body || body || 'Please review the information below.')
        },
        footer: {
          text: String(opts.footer || 'Verified Interactive Flow')
        },
        nativeFlowMessage: {
          buttons: []
        }
      }
    }
  };
}

/**
 * Creates a fake calendar event reply (Era 2023 - fevent)
 * @param {string} [eventName='Developer Conference 2026']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeEvent(eventName = 'Developer Conference 2026', options = {}) {
  const key = resolveBaseKey(options);

  return {
    key,
    message: {
      eventMessage: {
        isCanceled: false,
        name: eventName,
        description: options.description || 'Annual Keynote and Workshop Session.',
        location: {
          degreesLatitude: typeof options.latitude === 'number' ? options.latitude : 37.4848,
          degreesLongitude: typeof options.longitude === 'number' ? options.longitude : -122.1484,
          name: options.locationName || 'Silicon Valley Conference Center'
        },
        startTime: String(options.startTime || Math.floor(Date.now() / 1000) + 86400)
      }
    }
  };
}

/**
 * Creates a fake scheduled call reply (Era 2023 - fcall)
 * @param {string|object} [titleOrOptions='Team Sync & Standup']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeCall(titleOrOptions = 'Team Sync & Standup', options = {}) {
  let opts = {};
  let title = 'Team Sync & Standup';
  if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
    opts = { ...titleOrOptions, ...options };
    title = opts.title || opts.text || 'Team Sync & Standup';
  } else {
    opts = { ...options };
    title = typeof titleOrOptions === 'string' ? titleOrOptions : (opts.title || opts.text || 'Team Sync & Standup');
  }
  const key = resolveBaseKey({
    remoteJid: opts.remoteJid || '120363000000000000@g.us',
    participant: opts.participant || '0@s.whatsapp.net',
    ...opts
  });

  return {
    key,
    message: {
      scheduledCallCreationMessage: {
        scheduledTimestampMs: String(opts.timestampMs || Date.now() + 3600000),
        callType: typeof opts.callType === 'number' ? opts.callType : 1,
        title: String(opts.title || opts.text || title || 'Team Sync & Standup')
      }
    }
  };
}

/**
 * Creates a fake Meta AI reply (Era 2025 - fmeta)
 * @param {string} [text='I am Meta AI, how can I assist you today?']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeMetaAi(text = 'I am Meta AI, how can I assist you today?', options = {}) {
  const key = {
    remoteJid: options.remoteJid || options.chat || '0@s.whatsapp.net',
    fromMe: false,
    id: options.id || generateFakeId(),
    participant: '13135550002@s.whatsapp.net'
  };

  return {
    key,
    message: {
      extendedTextMessage: {
        text,
        contextInfo: {
          botInfo: {
            targetId: '13135550002@s.whatsapp.net',
            editTargetId: null
          }
        }
      }
    }
  };
}

/**
 * Creates a fake pinned message notice reply (Era 2025 - fpin)
 * @param {string|object} [textOrOptions='Important Announcement Pinned']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakePinned(textOrOptions = 'Important Announcement Pinned', options = {}) {
  let opts = {};
  let text = 'Important Announcement Pinned';
  if (typeof textOrOptions === 'object' && textOrOptions !== null) {
    opts = { ...textOrOptions, ...options };
    text = opts.text || opts.title || 'Important Announcement Pinned';
  } else {
    opts = { ...options };
    text = typeof textOrOptions === 'string' ? textOrOptions : (opts.text || opts.title || 'Important Announcement Pinned');
  }
  const key = resolveBaseKey(opts);

  return {
    key,
    message: {
      pinInChatMessage: {
        key: {
          remoteJid: key.remoteJid,
          fromMe: key.fromMe,
          id: key.id
        },
        type: 1,
        senderTimestampMs: Date.now()
      }
    }
  };
}

/**
 * Creates a fake view once media reply (Era 2025 - fviewonce)
 * @param {string|object} [captionOrOptions='View Once Photo']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeViewOnce(captionOrOptions = 'View Once Photo', options = {}) {
  let opts = {};
  let caption = 'View Once Photo';
  if (typeof captionOrOptions === 'object' && captionOrOptions !== null) {
    opts = { ...captionOrOptions, ...options };
    caption = opts.caption || opts.text || 'View Once Photo';
  } else {
    opts = { ...options };
    caption = typeof captionOrOptions === 'string' ? captionOrOptions : (opts.caption || opts.text || 'View Once Photo');
  }
  const key = resolveBaseKey(opts);
  const thumbnail = Buffer.isBuffer(opts.thumbnail) ? opts.thumbnail : (Buffer.isBuffer(opts.jpegThumbnail) ? opts.jpegThumbnail : DEFAULT_JPEG_THUMBNAIL);

  return {
    key,
    message: {
      viewOnceMessageV2: {
        message: {
          imageMessage: {
            url: 'https:' + String.fromCharCode(47, 47) + 'mmg.whatsapp.net/v/t62.7114-24/fake_image.enc',
            mimetype: opts.mimetype || 'image/jpeg',
            caption: String(caption),
            fileSha256: generateHashBuffer(key.id + '_sha'),
            fileLength: String(opts.fileLength || '102400'),
            height: 720,
            width: 1280,
            mediaKey: generateHashBuffer(key.id + '_key'),
            fileEncSha256: generateHashBuffer(key.id + '_enc'),
            directPath: '/v/t62.7114-24/fake_image.enc',
            mediaKeyTimestamp: Math.floor(Date.now() / 1000),
            jpegThumbnail: thumbnail,
            viewOnce: true
          }
        }
      }
    }
  };
}

/**
 * Creates a fake bot forwarded message reply (Era 2025 - fbot)
 * @param {string|object} [textOrOptions='Bot Forwarded Content']
 * @param {object} [options={}]
 * @returns {object}
 */
function fakeBotForwarded(textOrOptions = 'Bot Forwarded Content', options = {}) {
  let opts = {};
  let text = 'Bot Forwarded Content';
  if (typeof textOrOptions === 'object' && textOrOptions !== null) {
    opts = { ...textOrOptions, ...options };
    text = opts.text || opts.caption || 'Bot Forwarded Content';
  } else {
    opts = { ...options };
    text = typeof textOrOptions === 'string' ? textOrOptions : (opts.text || opts.caption || 'Bot Forwarded Content');
  }
  const botId = opts.botId || opts.participant || '13135550002@s.whatsapp.net';
  const key = resolveBaseKey({
    participant: botId,
    ...opts
  });

  return {
    key,
    message: {
      botForwardedMessage: {
        message: {
          extendedTextMessage: {
            text: String(text),
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: {
                botName: opts.botName || 'Meta AI',
                botJid: botId,
                creatorName: opts.creatorName || 'Meta'
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Complete registry of all fake reply generator functions and aliases
 * @readonly
 * @type {Map<string, Function>}
 */
const GENERATOR_REGISTRY = new Map([
  ['text', fakeText],
  ['ftext', fakeText],
  ['convo', fakeText],
  ['conversation', fakeText],

  ['contact', fakeContact],
  ['fcontact', fakeContact],
  ['kon', fakeContact],
  ['fkon', fakeContact],
  ['vcard', fakeContact],

  ['contacts', fakeContactsArray],
  ['fcontacts', fakeContactsArray],
  ['contactsarray', fakeContactsArray],

  ['trolley', fakeTrolley],
  ['ftrolley', fakeTrolley],
  ['troli', fakeTrolley],
  ['ftroli', fakeTrolley],
  ['order', fakeTrolley],
  ['forder', fakeTrolley],
  ['ordermessage', fakeTrolley],

  ['product', fakeProduct],
  ['fproduct', fakeProduct],
  ['productmessage', fakeProduct],

  ['document', fakeDocument],
  ['fdocument', fakeDocument],
  ['doc', fakeDocument],
  ['fdoc', fakeDocument],
  ['pdf', fakeDocument],

  ['audio', fakeAudio],
  ['faudio', fakeAudio],
  ['vn', fakeAudio],
  ['fvn', fakeAudio],
  ['voice', fakeAudio],
  ['fvoice', fakeAudio],
  ['ptt', fakeAudio],

  ['image', fakeImage],
  ['fimage', fakeImage],
  ['img', fakeImage],
  ['fimg', fakeImage],
  ['photo', fakeImage],

  ['video', fakeVideo],
  ['fvideo', fakeVideo],
  ['vid', fakeVideo],

  ['gif', fakeGif],
  ['fgif', fakeGif],

  ['location', fakeLocation],
  ['flocation', fakeLocation],
  ['loc', fakeLocation],
  ['floc', fakeLocation],

  ['livelocation', fakeLiveLocation],
  ['flivelocation', fakeLiveLocation],
  ['live', fakeLiveLocation],
  ['flive', fakeLiveLocation],

  ['status', fakeStatus],
  ['fstatus', fakeStatus],
  ['sw', fakeStatus],
  ['fsw', fakeStatus],
  ['story', fakeStatus],

  ['payment', fakePayment],
  ['fpayment', fakePayment],
  ['pay', fakePayment],
  ['fpay', fakePayment],

  ['groupinvite', fakeGroupInvite],
  ['fgroupinvite', fakeGroupInvite],
  ['invite', fakeGroupInvite],
  ['finvite', fakeGroupInvite],
  ['group', fakeGroupInvite],
  ['fgroup', fakeGroupInvite],

  ['sticker', fakeSticker],
  ['fsticker', fakeSticker],

  ['poll', fakePoll],
  ['fpoll', fakePoll],
  ['pollcreation', fakePoll],

  ['newsletter', fakeNewsletter],
  ['fnewsletter', fakeNewsletter],
  ['channel', fakeNewsletter],
  ['fchannel', fakeNewsletter],

  ['interactive', fakeInteractive],
  ['finteractive', fakeInteractive],
  ['nativeflow', fakeInteractive],

  ['event', fakeEvent],
  ['fevent', fakeEvent],

  ['call', fakeCall],
  ['fcall', fakeCall],
  ['calllog', fakeCall],

  ['meta', fakeMetaAi],
  ['fmeta', fakeMetaAi],
  ['metaai', fakeMetaAi],
  ['ai', fakeMetaAi],

  ['pin', fakePinned],
  ['fpin', fakePinned],
  ['pinned', fakePinned],

  ['viewonce', fakeViewOnce],
  ['fviewonce', fakeViewOnce],

  ['bot', fakeBotForwarded],
  ['fbot', fakeBotForwarded],
  ['botforwarded', fakeBotForwarded]
]);

/**
 * Main factory function creating any requested fake reply
 * @param {string} [type='trolley'] Type identifier or alias
 * @param {object} [options={}] Additional custom parameters
 * @returns {object} Baileys quoted message structure
 */
function createFakeReply(type = 'trolley', options = {}) {
  const normalized = String(type || 'trolley').toLowerCase().trim();
  const generator = GENERATOR_REGISTRY.get(normalized) || fakeTrolley;

  let personaData = {};
  if (options.persona && PERSONAS[options.persona]) {
    const p = PERSONAS[options.persona];
    personaData = {
      participant: p.jid,
      sender: p.jid,
      displayName: p.name,
      org: p.org
    };
  }

  const mergedOptions = {
    ...personaData,
    ...options
  };

  const firstArg = options.text || options.title || options.name || options.caption || options.question || options.fileName;

  if (normalized.includes('interactive')) {
    return generator(options.title || firstArg || 'Interactive Action', options.body || options.text || 'Please review the information below.', mergedOptions);
  }
  if (normalized.includes('call')) {
    return generator(options.title || firstArg || 'Team Sync & Standup', mergedOptions);
  }
  if (normalized.includes('pin')) {
    return generator(options.text || firstArg || 'Important Announcement Pinned', mergedOptions);
  }
  if (normalized.includes('viewonce')) {
    return generator(options.caption || firstArg || 'View Once Photo', mergedOptions);
  }
  if (normalized.includes('bot')) {
    return generator(options.text || firstArg || 'Bot Forwarded Content', mergedOptions);
  }
  if (normalized.includes('sticker')) {
    return generator(mergedOptions);
  }
  if (normalized.includes('audio') || normalized.includes('vn')) {
    return generator(options.text || firstArg || 'Voice Note', mergedOptions);
  }
  if (normalized.includes('image') || normalized.includes('img') || normalized.includes('photo')) {
    return generator(options.caption || firstArg || 'Photo Snapshot', mergedOptions);
  }
  if (normalized.includes('video') || normalized.includes('vid')) {
    return generator(options.caption || firstArg || 'Video Clip', mergedOptions);
  }
  if (normalized.includes('gif')) {
    return generator(options.caption || firstArg || 'Animated GIF', mergedOptions);
  }
  if (normalized.includes('kon') || normalized.includes('contact') || normalized.includes('vcard')) {
    return generator(mergedOptions.displayName || mergedOptions.name || 'WhatsApp Support', mergedOptions.number || '0', mergedOptions);
  }
  if (normalized.includes('poll')) {
    return generator(mergedOptions.question || 'Select an option', mergedOptions.options || ['Yes', 'No'], mergedOptions);
  }
  if (normalized.includes('newsletter') || normalized.includes('channel')) {
    return generator(mergedOptions.channelName || 'WhatsApp Channel', mergedOptions.text || 'Channel Broadcast', mergedOptions);
  }
  if (normalized.includes('loc') && !normalized.includes('live')) {
    return generator(mergedOptions.name || 'Silicon Valley HQ', mergedOptions.address || 'Menlo Park, CA', mergedOptions);
  }
  if (normalized.includes('payment') || normalized.includes('pay')) {
    return generator(mergedOptions.amount1000 || '1000000', mergedOptions.currency || 'USD', mergedOptions);
  }

  return generator(firstArg, mergedOptions);
}

/**
 * Creates a raw contextInfo object suitable for manual message crafting
 * @param {string} [type='trolley']
 * @param {object} [options={}]
 * @returns {object}
 */
function createFakeContextInfo(type = 'trolley', options = {}) {
  const fake = createFakeReply(type, options);
  return {
    stanzaId: fake.key.id,
    participant: fake.key.participant || '0@s.whatsapp.net',
    remoteJid: fake.key.remoteJid || 'status@broadcast',
    quotedMessage: fake.message
  };
}

/**
 * Fluent builder class for creating fake replies with chained configuration
 */
class FakeReplyBuilder {
  /**
   * Initializes a new FakeReplyBuilder instance
   */
  constructor() {
    this._type = 'trolley';
    this._options = {};
  }

  /**
   * Sets the fake reply type
   * @param {string} type
   * @returns {FakeReplyBuilder}
   */
  setType(type) {
    this._type = type;
    return this;
  }

  /**
   * Configures trolley quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  trolley(opts = {}) {
    this._type = 'trolley';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures contact quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  contact(opts = {}) {
    this._type = 'contact';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures Meta AI quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  meta(opts = {}) {
    this._type = 'meta';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures newsletter quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  newsletter(opts = {}) {
    this._type = 'newsletter';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures status story quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  status(opts = {}) {
    this._type = 'status';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures product quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  product(opts = {}) {
    this._type = 'product';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures document quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  document(opts = {}) {
    this._type = 'document';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures audio voice note quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  audio(opts = {}) {
    this._type = 'audio';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures image photo quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  image(opts = {}) {
    this._type = 'image';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures video clip quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  video(opts = {}) {
    this._type = 'video';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures animated GIF quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  gif(opts = {}) {
    this._type = 'gif';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures sticker quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  sticker(opts = {}) {
    this._type = 'sticker';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures interactive native flow quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  interactive(opts = {}) {
    this._type = 'interactive';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures pinned notice quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  pin(opts = {}) {
    this._type = 'pin';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures location quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  location(opts = {}) {
    this._type = 'location';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures live location quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  liveLocation(opts = {}) {
    this._type = 'liveLocation';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures group invite quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  groupInvite(opts = {}) {
    this._type = 'groupInvite';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures payment quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  payment(opts = {}) {
    this._type = 'payment';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures poll quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  poll(opts = {}) {
    this._type = 'poll';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures event quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  event(opts = {}) {
    this._type = 'event';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures call quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  call(opts = {}) {
    this._type = 'call';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures view once quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  viewOnce(opts = {}) {
    this._type = 'viewonce';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Configures bot forwarded quote
   * @param {object} [opts={}]
   * @returns {FakeReplyBuilder}
   */
  bot(opts = {}) {
    this._type = 'bot';
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Sets the main text, title, or caption
   * @param {string} text
   * @returns {FakeReplyBuilder}
   */
  setText(text) {
    this._options.text = text;
    this._options.title = text;
    this._options.caption = text;
    this._options.name = text;
    return this;
  }

  /**
   * Sets participant JID
   * @param {string} participant
   * @returns {FakeReplyBuilder}
   */
  setParticipant(participant) {
    this._options.participant = participant;
    return this;
  }

  /**
   * Sets remote JID
   * @param {string} remoteJid
   * @returns {FakeReplyBuilder}
   */
  setRemoteJid(remoteJid) {
    this._options.remoteJid = remoteJid;
    return this;
  }

  /**
   * Sets fromMe flag
   * @param {boolean} fromMe
   * @returns {FakeReplyBuilder}
   */
  setFromMe(fromMe) {
    this._options.fromMe = Boolean(fromMe);
    return this;
  }

  /**
   * Sets a predefined organization or persona
   * @param {string} personaName Key in PERSONAS
   * @returns {FakeReplyBuilder}
   */
  setPersona(personaName) {
    this._options.persona = personaName;
    return this;
  }

  /**
   * Sets custom thumbnail buffer
   * @param {Buffer} buffer
   * @returns {FakeReplyBuilder}
   */
  setThumbnail(buffer) {
    this._options.thumbnail = buffer;
    return this;
  }

  /**
   * Merges custom options
   * @param {object} opts
   * @returns {FakeReplyBuilder}
   */
  setOptions(opts) {
    this._options = { ...this._options, ...opts };
    return this;
  }

  /**
   * Builds the complete Baileys quoted message object
   * @returns {object}
   */
  build() {
    return createFakeReply(this._type, this._options);
  }

  /**
   * Builds contextInfo representation
   * @returns {object}
   */
  buildContextInfo() {
    return createFakeContextInfo(this._type, this._options);
  }
}

/**
 * Returns metadata and list of all available fake reply types
 * @returns {Array<{ type: string, era: string, description: string }>}
 */
function getAvailableTypes() {
  return [
    { type: 'trolley', aliases: ['ftroli', 'troli', 'order', 'fordermessage'], era: '2021-2022', description: 'Shopping trolley order receipt with total price and currency.' },
    { type: 'contact', aliases: ['fkon', 'kon', 'vcard'], era: '2019-2020', description: 'Official contact vCard card (e.g. WhatsApp Support 0@s.whatsapp.net).' },
    { type: 'status', aliases: ['fsw', 'sw', 'story'], era: '2021-2022', description: 'Replying to someone\'s WhatsApp Status story broadcast.' },
    { type: 'newsletter', aliases: ['fnewsletter', 'channel', 'fchannel'], era: '2023-2024', description: 'Verified WhatsApp Newsletter / Channel broadcast.' },
    { type: 'metaAi', aliases: ['fmeta', 'meta', 'ai'], era: '2025-2026', description: 'Meta AI Assistant verified reply header.' },
    { type: 'poll', aliases: ['fpoll', 'pollcreation'], era: '2023-2024', description: 'Interactive community poll creation card.' },
    { type: 'payment', aliases: ['fpay', 'pay'], era: '2021-2022', description: 'WhatsApp Pay payment request with currency amount.' },
    { type: 'product', aliases: ['fproduct', 'productmessage'], era: '2021-2022', description: 'Catalog business product listing with price tag.' },
    { type: 'document', aliases: ['fdoc', 'doc', 'pdf'], era: '2019-2020', description: 'Document file preview with page count and file size.' },
    { type: 'audio', aliases: ['faudio', 'fvn', 'vn', 'voice', 'ptt'], era: '2019-2020', description: 'Voice note (PTT) with custom waveform and duration.' },
    { type: 'image', aliases: ['fimage', 'fimg', 'img', 'photo'], era: '2019-2020', description: 'Photo snapshot thumbnail with caption.' },
    { type: 'video', aliases: ['fvideo', 'vid'], era: '2019-2020', description: 'Video playback preview with duration.' },
    { type: 'gif', aliases: ['fgif'], era: '2019-2020', description: 'Looping animated GIF clip.' },
    { type: 'location', aliases: ['floc', 'loc'], era: '2019-2020', description: 'Geographic map location pinpoint.' },
    { type: 'liveLocation', aliases: ['flive', 'live'], era: '2019-2020', description: 'Live location navigation tracker.' },
    { type: 'groupInvite', aliases: ['finvite', 'group', 'fgroup'], era: '2021-2022', description: 'Group invitation card with code and group name.' },
    { type: 'sticker', aliases: ['fsticker'], era: '2021-2022', description: 'Animated or static webp sticker.' },
    { type: 'interactive', aliases: ['finteractive', 'nativeflow'], era: '2023-2024', description: 'Native flow interactive card header.' },
    { type: 'event', aliases: ['fevent'], era: '2023-2024', description: 'Community scheduled event with timestamp and venue.' },
    { type: 'call', aliases: ['fcall', 'calllog'], era: '2023-2024', description: 'Scheduled voice or video call log.' },
    { type: 'pinned', aliases: ['fpin', 'pin'], era: '2025-2026', description: 'Pinned message notification.' },
    { type: 'viewOnce', aliases: ['fviewonce', 'viewonce'], era: '2025-2026', description: 'View once media envelope.' },
    { type: 'botForwarded', aliases: ['fbot', 'bot', 'botforwarded'], era: '2025-2026', description: 'Bot forwarded message attribution.' },
    { type: 'contactsArray', aliases: ['fcontacts'], era: '2019-2020', description: 'Multiple contacts vCard collection.' },
    { type: 'text', aliases: ['ftext', 'convo'], era: '2019-2020', description: 'Plain conversation quote.' }
  ];
}

module.exports = {
  createFakeReply,
  createFakeContextInfo,
  FakeReplyBuilder,
  getAvailableTypes,
  ERAS,
  PERSONAS,
  DEFAULT_JPEG_THUMBNAIL,
  DEFAULT_PNG_THUMBNAIL,
  DEFAULT_AUDIO_WAVEFORM,
  generateHashBuffer,
  formatVCard,
  generateFakeId,

  fakeText,
  fakeContact,
  fakeContactsArray,
  fakeTrolley,
  fakeProduct,
  fakeDocument,
  fakeAudio,
  fakeImage,
  fakeVideo,
  fakeGif,
  fakeLocation,
  fakeLiveLocation,
  fakeStatus,
  fakePayment,
  fakeGroupInvite,
  fakeSticker,
  fakePoll,
  fakeNewsletter,
  fakeInteractive,
  fakeEvent,
  fakeCall,
  fakeMetaAi,
  fakePinned,
  fakeViewOnce,
  fakeBotForwarded,

  ftext: fakeText,
  fkon: fakeContact,
  fcontacts: fakeContactsArray,
  ftroli: fakeTrolley,
  forder: fakeTrolley,
  fproduct: fakeProduct,
  fdoc: fakeDocument,
  fvn: fakeAudio,
  faudio: fakeAudio,
  fimg: fakeImage,
  fvideo: fakeVideo,
  fgif: fakeGif,
  floc: fakeLocation,
  flive: fakeLiveLocation,
  fstatus: fakeStatus,
  fsw: fakeStatus,
  fpay: fakePayment,
  finvite: fakeGroupInvite,
  fgroup: fakeGroupInvite,
  fsticker: fakeSticker,
  fpoll: fakePoll,
  fnewsletter: fakeNewsletter,
  fchannel: fakeNewsletter,
  finteractive: fakeInteractive,
  fevent: fakeEvent,
  fcall: fakeCall,
  fmeta: fakeMetaAi,
  fpin: fakePinned,
  fviewonce: fakeViewOnce,
  fbot: fakeBotForwarded
};
