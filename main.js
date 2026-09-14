document.addEventListener('DOMContentLoaded', () => {
  const revealBtn = document.getElementById('reveal-claim-btn');
  const claimForm = document.getElementById('claim-form-section');

  function openClaimForm() {
    if (!claimForm) return;
    claimForm.classList.remove('hidden');
    if (revealBtn) revealBtn.classList.add('hidden');
    claimForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (revealBtn && claimForm) {
    revealBtn.addEventListener('click', openClaimForm);
  }

  // If the page was loaded with #claim (e.g. from the home page CTA) or the
  // form was re-rendered after a validation error, show it immediately.
  if (window.location.hash === '#claim' || (claimForm && claimForm.dataset.forceOpen === 'true')) {
    openClaimForm();
  }

  // Copy-to-clipboard for any element marked with data-copy-value (static text)
  // or data-copy-target (reads the live value of another input on click).
  document.querySelectorAll('[data-copy-value], [data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      let value = button.getAttribute('data-copy-value');
      const targetId = button.getAttribute('data-copy-target');
      if (targetId) {
        const targetEl = document.getElementById(targetId);
        value = targetEl ? targetEl.value : '';
      }
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch (err) {
        // Fallback for older browsers / non-secure contexts.
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      const original = button.textContent;
      button.textContent = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = original;
        button.classList.remove('copied');
      }, 1600);
    });
  });
});
