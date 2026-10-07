export function generateMerchantPaymentLink(recipient, amount, note) {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({
    pay: 'true',
    recipient,
    amount: amount.toString(),
    note: note || ''
  });
  return `${baseUrl}?${params.toString()}`;
}

export function parsePaymentUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('pay') === 'true') {
    return {
      recipient: urlParams.get('recipient'),
      amount: parseFloat(urlParams.get('amount') || '0'),
      note: urlParams.get('note') || ''
    };
  }
  return null;
}
