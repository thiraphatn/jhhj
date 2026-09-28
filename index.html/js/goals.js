/* =========================================================
   MoneyMate - goals.js
   Savings goals: create, edit, delete, add money towards a
   goal, and celebrate when a goal reaches 100%.
   ========================================================= */

(function () {
  'use strict';

  let editingGoalId = null;
  let addMoneyGoalId = null;

  function getGoals() { return MM.readJSON(MM.KEYS.goals, []); }
  function saveGoals(list) {
    MM.writeJSON(MM.KEYS.goals, list);
    document.dispatchEvent(new CustomEvent('moneymate:data-changed', { detail: { type: 'goals' } }));
  }

  function renderGoals() {
    const goals = getGoals().slice().sort((a, b) => b.createdAt - a.createdAt);
    const container = document.getElementById('goalsList');
    const empty = document.getElementById('goalsEmpty');
    container.innerHTML = '';

    if (!goals.length) {
      empty.style.display = 'block';
      container.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    container.style.display = 'grid';

    goals.forEach(goal => container.appendChild(buildGoalCard(goal)));
  }

  function buildGoalCard(goal) {
    const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100)) : 0;
    const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
    const done = pct >= 100;

    const card = document.createElement('div');
    card.className = 'card goal-card';
    card.innerHTML = `
      <div class="goal-head">
        <h3>${escapeHtml(goal.name)}</h3>
        ${done ? '<span class="pill ok">สำเร็จแล้ว 🎉</span>' : ''}
      </div>
      <div class="goal-amounts">
        <div><span class="muted">ออมแล้ว</span><br><strong>${MM.formatMoney(goal.savedAmount)}</strong></div>
        <div><span class="muted">เป้าหมาย</span><br><strong>${MM.formatMoney(goal.targetAmount)}</strong></div>
        <div><span class="muted">ขาดอีก</span><br><strong>${MM.formatMoney(remaining)}</strong></div>
      </div>
      <div class="progress-track" style="margin:10px 0 6px;">
        <div class="progress-fill ${done ? '' : (pct >= 70 ? 'warn' : '')}" style="width:${pct}%;"></div>
      </div>
      <div class="goal-meta">
        <span>${pct}%</span>
        ${goal.targetDate ? `<span>เป้าหมายวันที่ ${MM.formatDateThai(goal.targetDate)}</span>` : '<span></span>'}
      </div>
      <div class="goal-actions">
        <button class="btn btn-primary btn-sm" data-add-money>+ เพิ่มเงินออม</button>
        <button class="btn btn-secondary btn-sm" data-edit-goal>แก้ไข</button>
        <button class="btn btn-danger btn-sm" data-del-goal>ลบ</button>
      </div>
    `;
    card.querySelector('[data-add-money]').addEventListener('click', () => openAddMoneyModal(goal));
    card.querySelector('[data-edit-goal]').addEventListener('click', () => openGoalModal(goal));
    card.querySelector('[data-del-goal]').addEventListener('click', () => {
      MM.confirmAction(`ต้องการลบเป้าหมาย "${goal.name}" หรือไม่?`, () => {
        saveGoals(getGoals().filter(g => g.id !== goal.id));
        MM.showToast('ลบเป้าหมายเรียบร้อย', 'success');
        renderGoals();
      });
    });
    return card;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- Add / Edit goal modal ---------- */

  function openGoalModal(goal) {
    editingGoalId = goal ? goal.id : null;
    document.getElementById('goalModalTitle').textContent = goal ? 'แก้ไขเป้าหมาย' : 'ตั้งเป้าหมายใหม่';
    document.getElementById('goalNameInput').value = goal ? goal.name : '';
    document.getElementById('goalTargetInput').value = goal ? goal.targetAmount : '';
    document.getElementById('goalDateInput').value = goal ? (goal.targetDate || '') : '';
    document.getElementById('goalError').classList.remove('show');
    MM.openModal('goalModal');
  }

  function saveGoalFromModal() {
    const name = document.getElementById('goalNameInput').value.trim();
    const target = parseFloat(document.getElementById('goalTargetInput').value);
    const targetDate = document.getElementById('goalDateInput').value;
    const errorEl = document.getElementById('goalError');

    if (!name) { errorEl.textContent = 'กรุณากรอกชื่อเป้าหมาย'; errorEl.classList.add('show'); return; }
    if (!target || target <= 0) { errorEl.textContent = 'กรุณากรอกจำนวนเงินเป้าหมายให้ถูกต้อง'; errorEl.classList.add('show'); return; }

    const list = getGoals();
    if (editingGoalId) {
      const idx = list.findIndex(g => g.id === editingGoalId);
      if (idx > -1) list[idx] = { ...list[idx], name, targetAmount: target, targetDate };
      MM.showToast('แก้ไขเป้าหมายเรียบร้อย', 'success');
    } else {
      list.push({ id: MM.uid(), name, targetAmount: target, savedAmount: 0, targetDate, createdAt: Date.now() });
      MM.showToast('สร้างเป้าหมายใหม่เรียบร้อย', 'success');
    }
    saveGoals(list);
    MM.closeModal('goalModal');
    renderGoals();
  }

  /* ---------- Add-money modal ---------- */

  function openAddMoneyModal(goal) {
    addMoneyGoalId = goal.id;
    document.getElementById('addMoneyGoalName').textContent = goal.name;
    document.getElementById('addMoneyInput').value = '';
    document.getElementById('addMoneyError').classList.remove('show');
    MM.openModal('addMoneyModal');
  }

  function saveAddMoney() {
    const amount = parseFloat(document.getElementById('addMoneyInput').value);
    const errorEl = document.getElementById('addMoneyError');
    if (!amount || amount <= 0) { errorEl.textContent = 'กรุณากรอกจำนวนเงินให้ถูกต้อง'; errorEl.classList.add('show'); return; }

    const list = getGoals();
    const idx = list.findIndex(g => g.id === addMoneyGoalId);
    if (idx === -1) return;

    const wasDone = list[idx].savedAmount >= list[idx].targetAmount;
    list[idx].savedAmount += amount;
    saveGoals(list);
    MM.closeModal('addMoneyModal');
    renderGoals();

    const nowDone = list[idx].savedAmount >= list[idx].targetAmount;
    if (nowDone && !wasDone) {
      MM.showToast(`ยินดีด้วย! คุณบรรลุเป้าหมาย "${list[idx].name}" แล้ว 🎉`, 'success');
    } else {
      MM.showToast('เพิ่มเงินออมเรียบร้อย', 'success');
    }
  }

  function initGoalsPage() {
    document.getElementById('addGoalBtn').addEventListener('click', () => openGoalModal(null));
    document.getElementById('addGoalBtnEmpty').addEventListener('click', () => openGoalModal(null));
    document.getElementById('goalSaveBtn').addEventListener('click', saveGoalFromModal);
    document.getElementById('goalCancelBtn').addEventListener('click', () => MM.closeModal('goalModal'));

    document.getElementById('addMoneySaveBtn').addEventListener('click', saveAddMoney);
    document.getElementById('addMoneyCancelBtn').addEventListener('click', () => MM.closeModal('addMoneyModal'));

    renderGoals();
  }

  document.addEventListener('moneymate:ready', function () {
    if (document.body.getAttribute('data-page') === 'goals') initGoalsPage();
  });

})();
