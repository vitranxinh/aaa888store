const views = [
  { id: "dashboard", label: "Tổng quan" },
  { id: "customers", label: "Khách hàng" },
  { id: "products", label: "Hàng hóa" },
  { id: "invoices", label: "Hóa đơn" },
  { id: "vouchers", label: "Phiếu thu chi" },
  { id: "debts", label: "Công nợ" },
];

const state = {
  view: "dashboard",
  db: null,
  selectedInvoiceId: null,
  loading: false,
  message: "",
  messageType: "info",
};

const appEl = document.querySelector("#app");
const navEl = document.querySelector("#navTabs");
const viewTitleEl = document.querySelector("#viewTitle");
const storeMetaEl = document.querySelector("#storeMeta");
const seedSummaryEl = document.querySelector("#seedSummary");
const printInvoiceBtn = document.querySelector("#printInvoiceBtn");

function currency(value) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
}

function number(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function showMessage(message, type = "info") {
  state.message = message;
  state.messageType = type;
}

async function api(path, method = "GET", body) {
  const options = { method, headers: {} };
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Yêu cầu thất bại.");
  }
  return payload;
}

async function refreshData(message, type = "info") {
  state.loading = true;
  render();
  try {
    state.db = await api("/api/bootstrap");
    if (!state.selectedInvoiceId && state.db.invoices[0]) {
      state.selectedInvoiceId = state.db.invoices[0].id;
    }
    if (message) showMessage(message, type);
  } catch (error) {
    showMessage(error.message, "danger");
  } finally {
    state.loading = false;
    render();
  }
}

function computeDerived(db) {
  const receiptTotal = db.vouchers.filter((item) => item.type === "receipt").reduce((sum, item) => sum + (item.amount || 0), 0);
  const paymentTotal = db.vouchers.filter((item) => item.type === "payment").reduce((sum, item) => sum + (item.amount || 0), 0);
  const invoiceTotal = db.invoices.reduce((sum, item) => sum + (item.total || 0), 0);
  const receivable = db.invoices.reduce((sum, invoice) => sum + Math.max((invoice.total || 0) - (invoice.paidAmount || 0), 0), 0);
  const inventoryValue = db.products.reduce((sum, item) => sum + (item.stock || 0) * (item.price || 0), 0);
  return { receiptTotal, paymentTotal, invoiceTotal, receivable, inventoryValue };
}

function customerDebt(customerId) {
  return state.db.invoices
    .filter((invoice) => invoice.customerId === customerId)
    .reduce((sum, invoice) => sum + Math.max(invoice.total - (invoice.paidAmount || 0), 0), 0);
}

function invoiceStatus(invoice) {
  const outstanding = Math.max((invoice.total || 0) - (invoice.paidAmount || 0), 0);
  if (outstanding === 0) return { label: "Đã thanh toán", className: "pill" };
  if ((invoice.paidAmount || 0) > 0) return { label: "Thanh toán một phần", className: "pill warning" };
  return { label: "Chưa thanh toán", className: "pill danger" };
}

function renderNav() {
  navEl.innerHTML = "";
  for (const view of views) {
    const btn = document.createElement("button");
    btn.textContent = view.label;
    btn.className = view.id === state.view ? "active" : "";
    btn.addEventListener("click", () => {
      state.view = view.id;
      render();
    });
    navEl.appendChild(btn);
  }
}

function statsGrid(items) {
  const container = document.createElement("div");
  container.className = "grid stats-grid";
  const template = document.querySelector("#statsCardTemplate");
  for (const item of items) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = item.label;
    node.querySelector(".stat-value").textContent = item.value;
    node.querySelector(".stat-note").textContent = item.note || "";
    container.appendChild(node);
  }
  return container;
}

function panel(title, body, extra) {
  const wrap = document.createElement("section");
  wrap.className = "panel";
  if (title) {
    const header = document.createElement("div");
    header.className = "panel-header";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    header.appendChild(h3);
    if (extra) header.appendChild(extra);
    wrap.appendChild(header);
  }
  wrap.appendChild(body);
  return wrap;
}

function messageBanner() {
  if (!state.message) return null;
  const box = document.createElement("div");
  box.className = `banner ${state.messageType}`;
  box.textContent = state.message;
  return box;
}

function actionButton(label, onClick, className = "ghost-button") {
  const button = document.createElement("button");
  button.className = className;
  button.textContent = label;
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function renderDashboard() {
  const derived = computeDerived(state.db);
  const wrap = document.createElement("div");
  wrap.className = "grid";

  wrap.appendChild(
    statsGrid([
      { label: "Khách hàng", value: number(state.db.customers.length), note: "Đang lưu trong SQLite" },
      { label: "Hàng hóa", value: number(state.db.products.length), note: "Đã nhập từ Excel và có thể thêm mới" },
      { label: "Doanh số hóa đơn", value: currency(derived.invoiceTotal), note: "Tổng từ tất cả hóa đơn" },
      { label: "Công nợ phải thu", value: currency(derived.receivable), note: "Tự cập nhật theo phiếu thu" },
    ]),
  );

  const split = document.createElement("div");
  split.className = "grid split-grid";

  const debtList = document.createElement("div");
  debtList.className = "list";
  [...state.db.customers]
    .map((customer) => ({ ...customer, debt: customerDebt(customer.id) }))
    .filter((item) => item.debt > 0)
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 8)
    .forEach((customer) => {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `<div><strong>${customer.name}</strong><p class="muted">${customer.id} • ${customer.phone || "Chưa có SĐT"}</p></div><strong>${currency(customer.debt)}</strong>`;
      debtList.appendChild(row);
    });
  split.appendChild(panel("Khách đang nợ nhiều nhất", debtList));

  const financial = document.createElement("div");
  financial.innerHTML = `
    <div class="summary-box">
      <p class="eyebrow">Tồn kho</p>
      <h3>${currency(derived.inventoryValue)}</h3>
      <p class="muted">Giá trị tạm tính theo giá bán hiện tại.</p>
    </div>
    <div class="summary-box" style="margin-top:16px">
      <p class="eyebrow">Thu/Chi</p>
      <h3>Thu ${currency(derived.receiptTotal)} / Chi ${currency(derived.paymentTotal)}</h3>
      <p class="muted">Phiếu thu gắn với hóa đơn sẽ tự giảm công nợ.</p>
    </div>
  `;
  split.appendChild(panel("Tài chính nhanh", financial));

  wrap.appendChild(split);
  return wrap;
}

function customerCreatePanel() {
  const body = document.createElement("div");
  const form = document.createElement("form");
  form.innerHTML = `
    <div class="form-grid">
      <label>
        <span>Mã khách hàng</span>
        <input name="id" placeholder="Để trống để app tự sinh mã" />
      </label>
      <label>
        <span>Tên khách hàng</span>
        <input name="name" required />
      </label>
      <label>
        <span>Điện thoại</span>
        <input name="phone" />
      </label>
      <label>
        <span>Địa chỉ</span>
        <input name="address" />
      </label>
      <label class="full">
        <span>Ghi chú</span>
        <textarea name="note" rows="3"></textarea>
      </label>
    </div>
    <div class="toolbar">
      <button type="submit" class="primary-button">Thêm khách hàng</button>
    </div>
  `;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/customers", "POST", {
        id: form.id.value.trim(),
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        address: form.address.value.trim(),
        note: form.note.value.trim(),
      });
      form.reset();
      await refreshData("Đã thêm khách hàng mới.", "success");
    } catch (error) {
      showMessage(error.message, "danger");
      render();
    }
  });
  body.appendChild(form);
  return panel("Tạo khách hàng", body);
}

function renderCustomers() {
  const container = document.createElement("div");
  container.className = "grid split-grid";

  const listBody = document.createElement("div");
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const search = document.createElement("input");
  search.placeholder = "Tìm theo tên, mã khách hàng, số điện thoại";
  toolbar.appendChild(search);
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";
  const table = document.createElement("table");
  tableWrap.appendChild(table);

  const renderTable = () => {
    const query = search.value.trim().toLowerCase();
    const rows = state.db.customers.filter((item) => [item.id, item.name, item.phone, item.address].join(" ").toLowerCase().includes(query));
    table.innerHTML = `
      <thead>
        <tr>
          <th>Mã KH</th>
          <th>Khách hàng</th>
          <th>Liên hệ</th>
          <th>Địa chỉ</th>
          <th>Công nợ</th>
          <th>Tổng bán</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
          <tr>
            <td>${item.id}</td>
            <td><strong>${item.name}</strong><br /><span class="muted">${item.note || ""}</span></td>
            <td>${item.phone || "Chưa có"}</td>
            <td>${item.address || ""}</td>
            <td>${currency(customerDebt(item.id))}</td>
            <td>${currency(item.lifetimeSales || 0)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    `;
  };

  search.addEventListener("input", renderTable);
  renderTable();
  listBody.append(toolbar, tableWrap);
  container.append(panel("Danh sách khách hàng", listBody), customerCreatePanel());
  return container;
}

function productCreatePanel() {
  const body = document.createElement("div");
  const form = document.createElement("form");
  form.innerHTML = `
    <div class="form-grid">
      <label>
        <span>Mã hàng</span>
        <input name="id" placeholder="Để trống để app tự sinh mã" />
      </label>
      <label>
        <span>Tên hàng</span>
        <input name="name" required />
      </label>
      <label>
        <span>Nhóm hàng</span>
        <input name="category" />
      </label>
      <label>
        <span>Giá bán</span>
        <input name="price" type="number" min="0" step="1000" required />
      </label>
      <label>
        <span>Tồn kho</span>
        <input name="stock" type="number" min="0" step="1" required />
      </label>
      <label class="full">
        <span>Hình ảnh URL</span>
        <textarea name="images" rows="3" placeholder="Mỗi dòng một URL"></textarea>
      </label>
    </div>
    <div class="toolbar">
      <button type="submit" class="primary-button">Thêm hàng hóa</button>
    </div>
  `;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/products", "POST", {
        id: form.id.value.trim(),
        name: form.name.value.trim(),
        category: form.category.value.trim(),
        price: Number(form.price.value || 0),
        stock: Number(form.stock.value || 0),
        images: form.images.value.split("\n").map((item) => item.trim()).filter(Boolean),
      });
      form.reset();
      await refreshData("Đã thêm hàng hóa mới.", "success");
    } catch (error) {
      showMessage(error.message, "danger");
      render();
    }
  });
  body.appendChild(form);
  return panel("Tạo hàng hóa", body);
}

function renderProducts() {
  const container = document.createElement("div");
  container.className = "grid split-grid";
  const listBody = document.createElement("div");
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const search = document.createElement("input");
  search.placeholder = "Tìm theo mã hàng, tên hàng, nhóm hàng";
  toolbar.appendChild(search);

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";
  const table = document.createElement("table");
  tableWrap.appendChild(table);

  const renderTable = () => {
    const query = search.value.trim().toLowerCase();
    const rows = state.db.products.filter((item) => [item.id, item.name, item.category].join(" ").toLowerCase().includes(query));
    table.innerHTML = `
      <thead>
        <tr>
          <th>Mã hàng</th>
          <th>Tên hàng</th>
          <th>Nhóm hàng</th>
          <th>Giá bán</th>
          <th>Tồn kho</th>
          <th>Nguồn</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .slice(0, 800)
          .map(
            (item) => `
          <tr>
            <td>${item.id}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.category || ""}</td>
            <td>${currency(item.price || 0)}</td>
            <td>${number(item.stock || 0)}</td>
            <td>${item.source}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    `;
  };

  search.addEventListener("input", renderTable);
  renderTable();
  listBody.append(toolbar, tableWrap);
  container.append(panel("Kho hàng", listBody), productCreatePanel());
  return container;
}

function invoiceFormPanel() {
  const body = document.createElement("div");
  const form = document.createElement("form");
  form.innerHTML = `
    <div class="form-grid">
      <label>
        <span>Khách hàng</span>
        <select name="customerId" required>
          <option value="">Chọn khách hàng</option>
          ${state.db.customers.map((item) => `<option value="${item.id}">${item.name} (${item.id})</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Ghi chú</span>
        <input name="note" placeholder="Ví dụ: chuyển khoản trước, gửi xe..." />
      </label>
    </div>
    <div class="invoice-items" id="invoiceItems"></div>
    <div class="toolbar">
      <button type="button" class="ghost-button" id="addItemBtn">Thêm dòng hàng</button>
      <button type="submit" class="primary-button">Tạo hóa đơn</button>
    </div>
  `;

  const itemsHost = form.querySelector("#invoiceItems");
  const productOptions = state.db.products
    .slice(0, 1500)
    .map((item) => `<option value="${item.id}">${item.name} (${item.id})</option>`)
    .join("");

  const addLine = () => {
    const line = document.createElement("div");
    line.className = "invoice-line";
    line.innerHTML = `
      <select name="productId" required>
        <option value="">Chọn hàng hóa</option>
        ${productOptions}
      </select>
      <input type="number" name="quantity" min="1" step="1" value="1" required />
      <input type="number" name="price" min="0" step="1000" placeholder="Đơn giá" required />
      <button type="button" class="ghost-button">Xóa</button>
    `;
    const select = line.querySelector('select[name="productId"]');
    const priceInput = line.querySelector('input[name="price"]');
    select.addEventListener("change", () => {
      const product = state.db.products.find((item) => item.id === select.value);
      priceInput.value = product?.price || 0;
    });
    line.querySelector("button").addEventListener("click", () => line.remove());
    itemsHost.appendChild(line);
  };

  form.querySelector("#addItemBtn").addEventListener("click", addLine);
  addLine();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const items = [...itemsHost.querySelectorAll(".invoice-line")]
      .map((line) => {
        const productId = line.querySelector('select[name="productId"]').value;
        const quantity = Number(line.querySelector('input[name="quantity"]').value || 0);
        const price = Number(line.querySelector('input[name="price"]').value || 0);
        if (!productId || quantity <= 0) return null;
        return { productId, quantity, price };
      })
      .filter(Boolean);

    if (!items.length) {
      showMessage("Hóa đơn cần ít nhất một dòng hàng.", "danger");
      render();
      return;
    }

    try {
      const snapshot = await api("/api/invoices", "POST", {
        customerId: form.customerId.value,
        note: form.note.value.trim(),
        items,
      });
      state.db = snapshot;
      state.selectedInvoiceId = snapshot.invoices[0]?.id || null;
      showMessage("Đã tạo hóa đơn mới.", "success");
      render();
    } catch (error) {
      showMessage(error.message, "danger");
      render();
    }
  });

  body.appendChild(form);
  return panel("Tạo hóa đơn mới", body);
}

function invoiceDetailPanel(invoice) {
  const body = document.createElement("div");
  if (!invoice) {
    body.innerHTML = `<p class="muted">Chọn một hóa đơn để xem chi tiết và in.</p>`;
    return panel("Chi tiết hóa đơn", body);
  }

  const status = invoiceStatus(invoice);
  body.innerHTML = `
    <div class="summary-box">
      <p class="eyebrow">Hóa đơn ${invoice.id}</p>
      <h3>${invoice.customerName}</h3>
      <p class="muted">${formatDate(invoice.createdAt)} • ${invoice.note || "Không có ghi chú"}</p>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table>
        <thead>
          <tr>
            <th>Mã hàng</th>
            <th>Tên hàng</th>
            <th>SL</th>
            <th>Đơn giá</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items
            .map(
              (item) => `
            <tr>
              <td>${item.productId}</td>
              <td>${item.productName}</td>
              <td>${number(item.quantity)}</td>
              <td>${currency(item.price)}</td>
              <td>${currency(item.lineTotal)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="toolbar" style="margin-top:16px">
      <span class="${status.className}">${status.label}</span>
      <strong>Tổng: ${currency(invoice.total)}</strong>
      <strong>Đã thu: ${currency(invoice.paidAmount || 0)}</strong>
      <strong>Còn nợ: ${currency(invoice.total - (invoice.paidAmount || 0))}</strong>
    </div>
  `;
  return panel("Chi tiết hóa đơn", body);
}

function renderInvoices() {
  const container = document.createElement("div");
  container.className = "grid split-grid";

  const listWrap = document.createElement("div");
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const search = document.createElement("input");
  search.placeholder = "Tìm hóa đơn theo mã, khách hàng";
  toolbar.appendChild(search);
  const list = document.createElement("div");
  list.className = "list";

  const renderList = () => {
    const query = search.value.trim().toLowerCase();
    list.innerHTML = "";
    state.db.invoices
      .filter((item) => [item.id, item.customerName, item.customerId].join(" ").toLowerCase().includes(query))
      .forEach((invoice) => {
        const row = document.createElement("button");
        row.className = "list-row";
        row.style.width = "100%";
        row.style.textAlign = "left";
        row.addEventListener("click", () => {
          state.selectedInvoiceId = invoice.id;
          render();
        });
        const status = invoiceStatus(invoice);
        row.innerHTML = `
          <div>
            <strong>${invoice.id} • ${invoice.customerName}</strong>
            <p class="muted">${formatDate(invoice.createdAt)}</p>
          </div>
          <div>
            <span class="${status.className}">${status.label}</span>
            <p><strong>${currency(invoice.total)}</strong></p>
          </div>
        `;
        list.appendChild(row);
      });
  };

  search.addEventListener("input", renderList);
  renderList();

  listWrap.appendChild(panel("Danh sách hóa đơn", (() => {
    const body = document.createElement("div");
    body.append(toolbar, list);
    return body;
  })()));
  listWrap.appendChild(invoiceFormPanel());

  const selected = state.db.invoices.find((item) => item.id === state.selectedInvoiceId) || state.db.invoices[0];
  state.selectedInvoiceId = selected?.id || null;
  container.append(listWrap, invoiceDetailPanel(selected));
  return container;
}

function voucherFormPanel() {
  const body = document.createElement("div");
  const form = document.createElement("form");
  form.innerHTML = `
    <div class="form-grid">
      <label>
        <span>Loại phiếu</span>
        <select name="type" required>
          <option value="receipt">Phiếu thu</option>
          <option value="payment">Phiếu chi</option>
        </select>
      </label>
      <label>
        <span>Số tiền</span>
        <input name="amount" type="number" min="0" step="1000" required />
      </label>
      <label>
        <span>Khách hàng</span>
        <select name="customerId">
          <option value="">Không gắn khách hàng</option>
          ${state.db.customers.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Hóa đơn</span>
        <select name="invoiceId">
          <option value="">Không gắn hóa đơn</option>
          ${state.db.invoices.map((item) => `<option value="${item.id}">${item.id} - ${item.customerName}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Phương thức</span>
        <input name="method" placeholder="Tiền mặt / Chuyển khoản" />
      </label>
      <label>
        <span>Ghi chú</span>
        <input name="note" placeholder="Nội dung phiếu thu chi" />
      </label>
    </div>
    <div class="toolbar">
      <button type="submit" class="primary-button">Lưu phiếu</button>
    </div>
  `;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.db = await api("/api/vouchers", "POST", {
        type: form.type.value,
        amount: Number(form.amount.value || 0),
        customerId: form.customerId.value,
        invoiceId: form.invoiceId.value,
        method: form.method.value.trim(),
        note: form.note.value.trim(),
      });
      showMessage("Đã lưu phiếu thu/chi.", "success");
      render();
    } catch (error) {
      showMessage(error.message, "danger");
      render();
    }
  });

  body.appendChild(form);
  return panel("Tạo phiếu thu / chi", body);
}

function renderVouchers() {
  const container = document.createElement("div");
  container.className = "grid split-grid";
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Mã phiếu</th>
        <th>Ngày</th>
        <th>Loại</th>
        <th>Khách hàng</th>
        <th>Hóa đơn</th>
        <th>Số tiền</th>
        <th>Nội dung</th>
      </tr>
    </thead>
    <tbody>
      ${state.db.vouchers
        .map(
          (item) => `
        <tr>
          <td>${item.id}</td>
          <td>${formatDate(item.createdAt)}</td>
          <td>${item.type === "receipt" ? "Phiếu thu" : "Phiếu chi"}</td>
          <td>${item.customerName || ""}</td>
          <td>${item.invoiceId || ""}</td>
          <td>${currency(item.amount)}</td>
          <td>${item.note || ""}</td>
        </tr>`,
        )
        .join("")}
    </tbody>
  `;
  tableWrap.appendChild(table);
  container.append(panel("Danh sách phiếu thu chi", tableWrap), voucherFormPanel());
  return container;
}

function renderDebts() {
  const body = document.createElement("div");
  body.className = "table-wrap";
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Hóa đơn</th>
        <th>Khách hàng</th>
        <th>Ngày</th>
        <th>Tổng</th>
        <th>Đã thu</th>
        <th>Còn nợ</th>
        <th>Ghi chú</th>
      </tr>
    </thead>
    <tbody>
      ${state.db.debts
        .sort((a, b) => b.remaining - a.remaining)
        .map(
          (item) => `
        <tr>
          <td>${item.invoiceId}</td>
          <td>${item.customerName}</td>
          <td>${formatDate(item.date)}</td>
          <td>${currency(item.amountDue)}</td>
          <td>${currency(item.amountPaid)}</td>
          <td>${currency(item.remaining)}</td>
          <td>${item.note || ""}</td>
        </tr>`,
        )
        .join("")}
    </tbody>
  `;
  body.appendChild(table);
  return panel("Công nợ theo hóa đơn", body);
}

function renderInvoicePrintButton() {
  const active = state.view === "invoices" && state.selectedInvoiceId;
  printInvoiceBtn.classList.toggle("hidden", !active);
}

function renderLoading() {
  const panelBody = document.createElement("div");
  panelBody.innerHTML = `<p class="muted">Đang tải dữ liệu...</p>`;
  appEl.innerHTML = "";
  appEl.appendChild(panel("Khởi động ứng dụng", panelBody));
}

function render() {
  renderNav();
  renderInvoicePrintButton();
  if (state.loading || !state.db) {
    renderLoading();
    return;
  }

  const currentView = views.find((item) => item.id === state.view);
  viewTitleEl.textContent = currentView.label;
  storeMetaEl.textContent = `${state.db.meta.storeName} • ${state.db.meta.address}`;
  seedSummaryEl.textContent = `${number(state.db.meta.counts.customers)} khách hàng, ${number(state.db.meta.counts.products)} hàng hóa, ${number(state.db.meta.counts.invoices)} hóa đơn`;
  appEl.innerHTML = "";

  const banner = messageBanner();
  if (banner) appEl.appendChild(banner);

  const screen = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    products: renderProducts,
    invoices: renderInvoices,
    vouchers: renderVouchers,
    debts: renderDebts,
  }[state.view]();

  appEl.appendChild(screen);
}

async function resetFromExcel() {
  try {
    state.loading = true;
    render();
    state.db = await api("/api/reset", "POST", {});
    showMessage("Đã import lại toàn bộ dữ liệu từ Excel vào SQLite.", "success");
  } catch (error) {
    showMessage(error.message, "danger");
  } finally {
    state.loading = false;
    render();
  }
}

async function init() {
  document.querySelector("#resetBtn").addEventListener("click", resetFromExcel);
  printInvoiceBtn.addEventListener("click", () => window.print());
  await refreshData("App đã kết nối backend SQLite.", "success");
}

init();
