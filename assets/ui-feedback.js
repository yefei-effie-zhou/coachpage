export function createFeedback(select) {
  let toastTimer = 0;

  function notify(message, type = 'info', action = null) {
    const region = select('#toastRegion');
    if (!region) return;
    clearTimeout(toastTimer);
    const toast = document.createElement('div');
    const copy = String(message || '');
    const inferredType = type === 'info' && /失败|无法|错误|不支持|请先|请输入有效|未连接|没有可/.test(copy) ? 'error' : type;
    toast.className = `toast ${inferredType}`;
    toast.textContent = copy;
    if (action?.label && typeof action.run === 'function') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = action.label;
      button.onclick = () => { action.run(); toast.remove(); };
      toast.append(button);
    }
    region.replaceChildren(toast);
    toastTimer = setTimeout(() => toast.remove(), action ? 8000 : 4200);
  }

  function confirmAction(message, { title = '确认操作', confirmLabel = '确认', danger = true } = {}) {
    const modal = select('#confirmDialog');
    select('#confirmTitle').textContent = title;
    select('#confirmMessage').textContent = message;
    select('#confirmAccept').textContent = confirmLabel;
    select('#confirmAccept').classList.toggle('danger', danger);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        modal.close();
        resolve(value);
      };
      select('#confirmCancel').onclick = () => finish(false);
      select('#confirmAccept').onclick = () => finish(true);
      modal.oncancel = event => { event.preventDefault(); finish(false); };
      modal.showModal();
      select('#confirmCancel').focus();
    });
  }

  return { notify, confirmAction };
}
