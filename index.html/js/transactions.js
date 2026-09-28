/* =========================================================
   MoneyMate - transactions.js
   - Expense CRUD with the "never below zero" balance rule
   - Salary / เงินเดือน-เงินตั้งต้น modal
   - Add/Edit expense modal (shared by dashboard + history)
   - Dashboard: summary cards, range-based stat row + table
   - History page: search / filter / sort / render list
   Depends on window.MM from app.js and Chart rendering from
   charts.js (dashboard page only).
   ========================================================= */

(function () {
  'use strict';

  let currentRangeType = '6m';
  let customStart = null;
  let customEnd = null;
  let editingExpenseId = null;

  /* ================= Category picker (shared) ================= */

  function renderCategoryPicker(container, categories, selectedId) {
    container.innerHTML = '';
    categories.forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'category-chip' + (cat.id === selectedId ? ' active' : '');
      chip.dataset.categoryId = cat.id;
      chip.innerHTML = `<span class="em">${cat.icon}</span>${cat.label}`;
      chip.addEventListener('click', () => {
        container.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        container.dataset.selected = cat.id;
      });
      container.appendChild(chip);
    });
    container.dataset.selected = selectedId || (categories[0] && categories[0].id) || '';
  }

  /* ================= Expense modal ================= */

  async function openExpenseModal(tx) {
    const categories = await MM.loadCategories();
    const picker = document.getElementById('expenseCategoryPicker');
    editingExpenseId = tx ? tx.id : null;

    document.getElementById('expenseModalTitle').textContent = tx ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย';
    document.getElementById('expenseAmountInput').value = tx ? tx.amount : '';
    document.getElementById('expenseNoteInput').value = tx ? (tx.note || '') : '';
    const expenseDate = tx ? tx.date : MM.todayISO();
    MM.setThaiDateSelects('expenseDaySelect', 'expenseMonthSelect', 'expenseYearSelect', expenseDate);
    document.getElementById('expenseDateInput').value = expenseDate;
    document.getElementById('expenseDeleteBtn').style.display = tx ? 'inline-flex' : 'none';
    hideExpenseAlert();
    renderCategoryPicker(picker, categories, tx ? tx.categoryId : categories[0].id);

    const monthKey = MM.toMonthKey(tx ? tx.date : MM.todayISO());
    if (!MM.hasSalaryForMonth(monthKey)) {
      showExpenseAlert('ยังไม่ได้ตั้งเงินเดือน/เงินตั้งต้นของเดือนนี้ กรุณาตั้งเงินเดือนก่อนเพิ่มรายจ่าย');
    }

    MM.openModal('expenseModal');
  }

  function closeExpenseModal() {
    MM.closeModal('expenseModal');
    editingExpenseId = null;
  }

  function showExpenseAlert(msg) {
    const el = document.getElementById('expenseAlert');
    el.textContent = msg;
    el.classList.add('show');
  }
  function hideExpenseAlert() {
    const el = document.getElementById('expenseAlert');
    el.classList.remove('show');
    el.textContent = '';
  }

  function saveExpenseFromModal() {
    hideExpenseAlert();
    const amountInput = document.getElementById('expenseAmountInput');
    const dateInput = document.getElementById('expenseDateInput');
    const noteInput = document.getElementById('expenseNoteInput');
    const picker = document.getElementById('expenseCategoryPicker');

    const amount = parseFloat(amountInput.value);
    const date = dateInput.value;
    const categoryId = picker.dataset.selected;
    const note = noteInput.value.trim();

    if (!amount || amount <= 0) {
      showExpenseAlert('กรุณากรอกจำนวนเงินให้ถูกต้อง');
      return;
    }
    if (!date) {
      showExpenseAlert('กรุณาเลือกวันที่');
      return;
    }
    if (!categoryId) {
      showExpenseAlert('กรุณาเลือกหมวดหมู่');
      return;
    }

    const monthKey = MM.toMonthKey(date);
    if (!MM.hasSalaryForMonth(monthKey)) {
      showExpenseAlert('กรุณาตั้งเงินเดือน/เงินตั้งต้นของเดือนนี้ก่อนเพิ่มรายจ่าย');
      return;
    }

    const available = MM.getAvailableToSpend(monthKey, editingExpenseId);
    if (amount > available) {
      showExpenseAlert(`เงินไม่เพียงพอ คุณสามารถใช้ได้อีก ${MM.formatMoney(available)}`);
      return;
    }

    const list = MM.getAllTransactions();
    if (editingExpenseId) {
      const idx = list.findIndex(t => t.id === editingExpenseId);
      if (idx > -1) {
        list[idx] = { ...list[idx], amount, categoryId, note, date };
      }
      MM.saveAllTransactions(list);
      MM.showToast('แก้ไขรายจ่ายเรียบร้อย', 'success');
    } else {
      list.push({
        id: MM.uid(), amount, categoryId, note, date, createdAt: Date.now()
      });
      MM.saveAllTransactions(list);
      MM.showToast('บันทึกรายจ่ายเรียบร้อย', 'success');
    }

    closeExpenseModal();
    refreshCurrentPage();
  }

  function deleteExpense(id) {
    MM.confirmAction('ต้องการลบรายการนี้หรือไม่? เงินจะถูกคืนเข้ายอดคงเหลือ', () => {
      const list = MM.getAllTransactions().filter(t => t.id !== id);
      MM.saveAllTransactions(list);
      MM.showToast('ลบรายการเรียบร้อย', 'success');
      refreshCurrentPage();
    });
  }

  // Wipes every transaction in the app (not just the ones matching the current
  // search/filter on the history page) so balances everywhere recalculate to
  // "no expenses yet" for every month.
  function deleteAllHistory() {
    const count = MM.getAllTransactions().length;
    if (!count) {
      MM.showToast('ไม่มีรายการให้ลบ', 'info');
      return;
    }
    MM.confirmAction(
      `ต้องการลบประวัติรายจ่ายทั้งหมด ${count} รายการหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้ และเงินทั้งหมดจะถูกคืนเข้ายอดคงเหลือของทุกเดือน`,
      () => {
        MM.saveAllTransactions([]);
        MM.showToast('ลบประวัติรายจ่ายทั้งหมดเรียบร้อย', 'success');
        refreshCurrentPage();
      }
    );
  }

  /* ================= Salary modal ================= */

  function openSalaryModal() {
    const amountInput = document.getElementById('salaryAmountInput');
    const monthKey = MM.currentMonthKey();
    const existingDate = MM.getSalaryDateForMonth(monthKey);
    MM.setThaiDateSelects('salaryDaySelect', 'salaryMonthSelect', 'salaryYearSelect', existingDate || MM.todayISO());
    amountInput.value = MM.hasSalaryForMonth(monthKey) ? MM.getSalaryForMonth(monthKey) : '';
    document.getElementById('salaryError').classList.remove('show');
    MM.openModal('salaryModal');
  }

  function saveSalaryFromModal() {
    const amountInput = document.getElementById('salaryAmountInput');
    const errorEl = document.getElementById('salaryError');
    const amount = parseFloat(amountInput.value);
    const date = MM.getISOFromThaiDateSelects('salaryDaySelect', 'salaryMonthSelect', 'salaryYearSelect');

    if (!date) {
      errorEl.textContent = 'กรุณาเลือกวันที่ให้ครบถ้วน';
      errorEl.classList.add('show');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      errorEl.textContent = 'กรุณากรอกจำนวนเงินให้ถูกต้อง';
      errorEl.classList.add('show');
      return;
    }
    const monthKey = MM.toMonthKey(date);
    MM.setSalaryForMonth(monthKey, amount, date);
    MM.showToast(`ตั้งเงินเดือน${MM.monthLabel(monthKey)} เรียบร้อย`, 'success');
    MM.closeModal('salaryModal');
    refreshCurrentPage();
  }

  /* ================= Dashboard: summary cards ================= */

  function renderDashboardCards() {
    const monthKey = MM.currentMonthKey();
    const summary = MM.getMonthSummary(monthKey);
    const usedPct = summary.salary > 0 ? Math.min(100, Math.round((summary.expenses / summary.salary) * 100)) : 0;

    document.getElementById('cardRemaining').querySelector('.amount').textContent = MM.formatMoney(summary.remaining);
    document.getElementById('cardSalary').querySelector('.amount').textContent = MM.formatMoney(summary.salary);
    document.getElementById('cardExpense').querySelector('.amount').textContent = MM.formatMoney(summary.expenses);
    document.getElementById('cardUsedPct').querySelector('.amount').textContent = usedPct + '%';

    const salaryDateEl = document.getElementById('cardSalaryDate');
    if (salaryDateEl) {
      const salaryDate = MM.getSalaryDateForMonth(monthKey);
      salaryDateEl.textContent = salaryDate ? `ตั้งเมื่อ ${MM.formatDateThai(salaryDate)}` : '';
    }

    const noSalary = !MM.hasSalaryForMonth(monthKey);
    const noSalaryNote = document.getElementById('noSalaryNote');
    if (noSalaryNote) noSalaryNote.style.display = noSalary ? 'block' : 'none';
  }

  /* ================= Dashboard: recent transactions ================= */

  async function renderRecentTransactions() {
    const categories = await MM.loadCategories();
    const list = MM.getAllTransactions()
      .slice()
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .slice(0, 5);

    const container = document.getElementById('recentTxList');
    const empty = document.getElementById('recentTxEmpty');
    container.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      container.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    container.style.display = 'flex';

    list.forEach(tx => container.appendChild(buildTxRow(tx, categories, false)));
  }

  function buildTxRow(tx, categories, showActions) {
    const cat = categories.find(c => c.id === tx.categoryId) || categories[categories.length - 1];
    const row = document.createElement('div');
    row.className = 'tx-row';
    row.innerHTML = `
      <div class="tx-icon" style="background:${cat.color}22;">${cat.icon}</div>
      <div class="tx-info">
        <div class="t1">${cat.label}${tx.note ? ' · ' + escapeHtml(tx.note) : ''}</div>
        <div class="t2">${MM.formatDateThai(tx.date)}</div>
      </div>
      <div class="tx-amount">-${MM.formatMoney(tx.amount)}</div>
    `;
    if (showActions !== false) {
      const actions = document.createElement('div');
      actions.className = 'tx-actions';
      actions.innerHTML = `
        <button class="btn btn-icon btn-sm" title="แก้ไข" data-edit="${tx.id}">✏️</button>
        <button class="btn btn-icon btn-sm" title="ลบ" data-del="${tx.id}">🗑️</button>
      `;
      row.appendChild(actions);
      actions.querySelector('[data-edit]').addEventListener('click', () => openExpenseModal(tx));
      actions.querySelector('[data-del]').addEventListener('click', () => deleteExpense(tx.id));
    }
    return row;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ================= Dashboard: range section (stats + table) ================= */

  function renderRangeSection() {
    const months = MM.getMonthRange(currentRangeType, customStart, customEnd);
    const captionText = currentRangeType === 'custom' && customStart && customEnd
      ? `${MM.monthLabel(customStart)} - ${MM.monthLabel(customEnd)}`
      : MM.rangeLabel(currentRangeType);
    document.getElementById('rangeCaption').textContent = `สรุปการเงิน — ${captionText}`;

    let totalSalary = 0, totalExpense = 0;
    const rows = months.map(mk => {
      const s = MM.getMonthSummary(mk);
      totalSalary += s.salary;
      totalExpense += s.expenses;
      return s;
    });
    const hasAnyData = rows.some(r => r.salary > 0 || r.expenses > 0);

    document.getElementById('statSalaryTotal').textContent = MM.formatMoney(totalSalary);
    document.getElementById('statExpenseTotal').textContent = MM.formatMoney(totalExpense);
    document.getElementById('statNetRemaining').textContent = MM.formatMoney(Math.max(0, totalSalary - totalExpense));
    document.getElementById('statAvgExpense').textContent = MM.formatMoney(months.length ? totalExpense / months.length : 0);

    const tbody = document.getElementById('summaryTableBody');
    const emptyEl = document.getElementById('summaryTableEmpty');
    const wrap = document.getElementById('summaryTableWrap');
    tbody.innerHTML = '';

    if (!hasAnyData) {
      wrap.style.display = 'none';
      emptyEl.style.display = 'block';
    } else {
      wrap.style.display = 'block';
      emptyEl.style.display = 'none';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${MM.monthLabel(r.monthKey)}</td>
          <td class="num">${MM.formatMoneyPlain(r.salary)} ฿</td>
          <td class="num">${MM.formatMoneyPlain(r.expenses)} ฿</td>
          <td class="num">${MM.formatMoneyPlain(r.remaining)} ฿</td>
        `;
        tbody.appendChild(tr);
      });
    }

    if (window.MMCharts) {
      window.MMCharts.renderSalaryExpenseChart(rows);
      window.MMCharts.renderCategoryChart(months);
    }
  }

  function initRangePicker() {
    const select = document.getElementById('rangeSelect');
    const customRow = document.getElementById('customRangeRow');
    const startInput = document.getElementById('customStartMonth');
    const endInput = document.getElementById('customEndMonth');

    select.value = currentRangeType;
    select.addEventListener('change', () => {
      currentRangeType = select.value;
      customRow.classList.toggle('show', currentRangeType === 'custom');
      if (currentRangeType === 'custom') {
        if (!startInput.value) startInput.value = MM.addMonths(MM.currentMonthKey(), -5);
        if (!endInput.value) endInput.value = MM.currentMonthKey();
        customStart = startInput.value;
        customEnd = endInput.value;
      }
      renderRangeSection();
    });

    [startInput, endInput].forEach(inp => {
      inp.addEventListener('change', () => {
        customStart = startInput.value;
        customEnd = endInput.value;
        if (customStart && customEnd && MM.compareMonthKeys(customStart, customEnd) <= 0) {
          renderRangeSection();
        }
      });
    });
  }

  /* ================= History page ================= */

  async function renderHistoryList() {
    const categories = await MM.loadCategories();
    const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    const filterCat = document.getElementById('filterCategory').value;
    const filterMonth = document.getElementById('filterMonth').value;

    let list = MM.getAllTransactions();

    if (filterMonth && filterMonth !== 'all') {
      list = list.filter(t => MM.toMonthKey(t.date) === filterMonth);
    }
    if (filterCat && filterCat !== 'all') {
      list = list.filter(t => t.categoryId === filterCat);
    }
    if (search) {
      list = list.filter(t => {
        const cat = categories.find(c => c.id === t.categoryId);
        const hay = `${t.note || ''} ${cat ? cat.label : ''}`.toLowerCase();
        return hay.includes(search);
      });
    }

    // newest -> oldest
    list.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

    const container = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');
    container.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      container.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    container.style.display = 'flex';
    list.forEach(tx => container.appendChild(buildTxRow(tx, categories, true)));
  }

  function populateMonthFilter() {
    const select = document.getElementById('filterMonth');
    const months = Array.from(new Set(MM.getAllTransactions().map(t => MM.toMonthKey(t.date))))
      .sort((a, b) => b.localeCompare(a));
    select.innerHTML = '<option value="all">ทุกเดือน</option>' +
      months.map(mk => `<option value="${mk}">${MM.monthLabel(mk)}</option>`).join('');
  }

  async function populateCategoryFilter() {
    const categories = await MM.loadCategories();
    const select = document.getElementById('filterCategory');
    select.innerHTML = '<option value="all">ทุกหมวดหมู่</option>' +
      categories.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('');
  }

  /* ================= Shared date-select wiring ================= */

  // Wires the visible day/month/year selects for the expense modal so any change to them
  // keeps the hidden #expenseDateInput (the value the rest of the code reads) up to date.
  function initExpenseDateSelects() {
    if (!document.getElementById('expenseDaySelect')) return;
    MM.populateThaiDateSelects('expenseDaySelect', 'expenseMonthSelect', 'expenseYearSelect');
    ['expenseDaySelect', 'expenseMonthSelect', 'expenseYearSelect'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const iso = MM.getISOFromThaiDateSelects('expenseDaySelect', 'expenseMonthSelect', 'expenseYearSelect');
        if (iso) document.getElementById('expenseDateInput').value = iso;
      });
    });
  }

  function initSalaryDateSelects() {
    if (!document.getElementById('salaryDaySelect')) return;
    MM.populateThaiDateSelects('salaryDaySelect', 'salaryMonthSelect', 'salaryYearSelect');
  }

  /* ================= Page bootstrap ================= */

  function refreshCurrentPage() {
    const page = document.body.getAttribute('data-page');
    if (page === 'dashboard') {
      renderDashboardCards();
      renderRecentTransactions();
      renderRangeSection();
    } else if (page === 'history') {
      populateMonthFilter();
      renderHistoryList();
    }
  }

  async function initDashboardPage() {
    initSalaryDateSelects();
    initExpenseDateSelects();

    document.getElementById('setSalaryBtn').addEventListener('click', openSalaryModal);
    document.getElementById('salarySaveBtn').addEventListener('click', saveSalaryFromModal);
    document.getElementById('salaryCancelBtn').addEventListener('click', () => MM.closeModal('salaryModal'));

    document.getElementById('addExpenseBtn').addEventListener('click', () => openExpenseModal(null));
    document.getElementById('expenseSaveBtn').addEventListener('click', saveExpenseFromModal);
    document.getElementById('expenseCancelBtn').addEventListener('click', closeExpenseModal);
    document.getElementById('expenseDeleteBtn').addEventListener('click', () => {
      if (editingExpenseId) {
        const id = editingExpenseId;
        closeExpenseModal();
        deleteExpense(id);
      }
    });

    initRangePicker();
    renderDashboardCards();
    await renderRecentTransactions();
    renderRangeSection();
  }

  async function initHistoryPage() {
    initExpenseDateSelects();
    await populateCategoryFilter();
    populateMonthFilter();
    renderHistoryList();

    document.getElementById('searchInput').addEventListener('input', renderHistoryList);
    document.getElementById('filterCategory').addEventListener('change', renderHistoryList);
    document.getElementById('filterMonth').addEventListener('change', renderHistoryList);

    document.getElementById('addExpenseBtn').addEventListener('click', () => openExpenseModal(null));
    document.getElementById('expenseSaveBtn').addEventListener('click', async () => {
      saveExpenseFromModal();
    });
    document.getElementById('expenseCancelBtn').addEventListener('click', closeExpenseModal);
    document.getElementById('expenseDeleteBtn').addEventListener('click', () => {
      if (editingExpenseId) {
        const id = editingExpenseId;
        closeExpenseModal();
        deleteExpense(id);
      }
    });

    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) deleteAllBtn.addEventListener('click', deleteAllHistory);
  }

  document.addEventListener('moneymate:ready', function () {
    const page = document.body.getAttribute('data-page');
    if (page === 'dashboard') initDashboardPage();
    if (page === 'history') initHistoryPage();
  });

  document.addEventListener('moneymate:data-changed', refreshCurrentPage);

  // expose for other modules (e.g. charts.js range change hooks) if ever needed
  window.MMTransactions = { refreshCurrentPage };

})();
