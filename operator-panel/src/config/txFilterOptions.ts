// Tranzaksiya filtr qiymatlari — bir joyda.
// Nova API integratsiyasida shu konstantalar Nova'dan to'ldiriladi,
// kod o'zgarmaydi.

export const TX_TYPES = [
  'Paynet', 'Visa', 'Cash', 'Transfer', 'By Phone', 'Iban', 'Wallet',
];

export const TX_CREDIT_STATES = [
  'Ok', 'Pending', 'Wait', 'Fail', 'Err', 'Cancel',
];

export const TX_DEBIT_STATES = [
  'Ok', 'Wait', 'Fail', 'Err', 'Cancel',
];

export const TX_STRANAS = [
  'uz', 'Visa', 'Tj', 'Cash', 'Kg', 'Ru', 'Tr',
];

export const TX_PROVIDERS = [
  'UNIRED_NEW_MTS_SPB',
  'UNIRED_NEW_MTS',
  'UNIRED_NEW_TKB',
  'UNIRED_NEW_MTS_VISA',
  'UNIRED_NEW_TKB_VISA',
  'UNIRED_CASH_TKB',
  'UNIRED_CASH_SBP',
  'UNIRED_CAROUSEL',
];

// Bitta tranzaksiya uchun amallar (Nova API keyin)
export const TX_ACTIONS = [
  'Statuslarni unireddan qayta olish',
  'Отправить сообщение!',
  'Recredit qilish (P2P)',
  'Recredit qilish (Payment)',
  'Recredit qilish (Yangi Uzcard kartaga)',
  "Qabul qiluvchi ma'lumotini o'zgartirish (CASH)",
  'Pulni qaytarish (CASH)',
  "Paynetni transferga o'zgartirish",
  'Recredit qilish (Visa)',
  "O'tkazma uchun keshbek berish",
  'Export As CSV',
  "P2p ma'lumotlarini yuklab olish",
  'Generate Central Bank Report',
];

// Bulk amallar uchun
export const TX_BULK_ACTIONS = [
  'Statuslarni unireddan qayta olish',
  'Debit statusni yangilash',
  'Kredit statusni yangilash',
  'Отправить сообщение!',
  'Recredit qilish (P2P)',
  'Recredit qilish (Payment)',
  'Confirm qilish',
];
