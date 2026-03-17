// ==========================================
// 1. Firebase Setup & Imports
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2LAi50zJIGgMJ60AEXdw0D5__yYYWNWw",
  authDomain: "dashboard-builder-aad0d.firebaseapp.com",
  projectId: "dashboard-builder-aad0d",
  storageBucket: "dashboard-builder-aad0d.firebasestorage.app",
  messagingSenderId: "302138831144",
  appId: "1:302138831144:web:a705428b34372092c7201d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
// ==========================================
// 2. DOM Elements & State
// ==========================================
const btnConfigure = document.getElementById('btn-configure-dashboard');
const btnCreateOrder = document.getElementById('btn-create-order');
const sidebar = document.getElementById('widget-sidebar');
const dateFilterBar = document.getElementById('date-filter-bar');
const canvas = document.getElementById('dashboard-canvas');
const draggableWidgets = document.querySelectorAll('.draggable-widget');
const orderModal = document.getElementById('order-modal');
const closeOrderModal = document.getElementById('close-order-modal');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings');
const tableBody = document.getElementById('customer-table-body');
const contextMenu = document.getElementById('context-menu');
const settingsContainer = document.getElementById('settings-form-container');

let isConfigMode = false;
let widgetIdCounter = 0; 
let activeWidgets = {}; 
let customerOrders = [];
let selectedOrderId = null; 
let currentlyEditingWidgetId = null;
let chartInstances = {}; 

const widgetDefaults = {
    'kpi-value':   { title: 'Untitled', type: 'KPI', width: 2, height: 2 },
    'bar-chart':   { title: 'Untitled', type: 'Bar chart', width: 5, height: 5 },
    'line-chart':  { title: 'Untitled', type: 'Line chart', width: 5, height: 5 },
    'pie-chart':   { title: 'Untitled', type: 'Pie chart', width: 4, height: 4 },
    'area-chart':  { title: 'Untitled', type: 'Area chart', width: 5, height: 5 },
    'scatter-plot':{ title: 'Untitled', type: 'Scatter plot chart', width: 5, height: 5 },
    'table':       { title: 'Untitled', type: 'Table', width: 4, height: 4 }
};

// ==========================================
// 3. Cloud Data Sync (Orders & Dashboard)
// ==========================================

// A. Fetch the Saved Dashboard Layout from the Cloud
getDoc(doc(db, "dashboard", "layout")).then(docSnap => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        activeWidgets = data.widgets || {};
        widgetIdCounter = data.counter || 0;
        
        const emptyState = canvas.querySelector('.empty-state');
        if (emptyState && Object.keys(activeWidgets).length > 0) emptyState.remove();

        Object.values(activeWidgets).forEach(widget => {
            buildWidgetDOM(widget);
        });
        updateAllWidgets();
    }
});

// B. Fetch Orders from the Cloud in Real-Time
onSnapshot(collection(db, "orders"), (snapshot) => {
    customerOrders = []; 
    snapshot.forEach((document) => {
        customerOrders.push({ dbId: document.id, ...document.data() }); 
    });
    renderCustomerTable();
    updateAllWidgets();
});

// ==========================================
// 4. Navigation & UI Toggles
// ==========================================
btnConfigure.addEventListener('click', () => {
    isConfigMode = !isConfigMode;
    if (isConfigMode) {
        sidebar.classList.remove('hidden');
        dateFilterBar.classList.remove('hidden');
        btnConfigure.textContent = "Exit Configuration";
    } else {
        sidebar.classList.add('hidden');
        dateFilterBar.classList.add('hidden');
        btnConfigure.textContent = "Configure Dashboard";
    }
});

// SAVE DASHBOARD TO CLOUD
document.getElementById('btn-save-config').addEventListener('click', async () => {
    btnConfigure.click(); 
    await setDoc(doc(db, "dashboard", "layout"), { 
        widgets: activeWidgets, 
        counter: widgetIdCounter 
    });
    alert("Dashboard Configuration Saved to Cloud!");
});

btnCreateOrder.addEventListener('click', () => {
    selectedOrderId = null; 
    document.getElementById('create-order-form').reset(); 
    orderModal.classList.remove('hidden');
});

closeOrderModal.addEventListener('click', () => {
    orderModal.classList.add('hidden');
});

// ==========================================
// 5. Drag, Drop, and Widget DOM Creation
// ==========================================
draggableWidgets.forEach(widget => {
    widget.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('widgetType', e.target.getAttribute('data-type'));
    });
});

canvas.addEventListener('dragover', (e) => {
    e.preventDefault(); 
    canvas.classList.add('drag-over');
});

canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('drag-over');
});

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('drag-over');
    const widgetType = e.dataTransfer.getData('widgetType');
    if (widgetType) {
        const emptyState = canvas.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        createWidgetOnCanvas(widgetType);
    }
});

function buildWidgetDOM(widget) {
    const widgetEl = document.createElement('div');
    widgetEl.classList.add('dashboard-widget');
    widgetEl.id = widget.id;
    widgetEl.style.gridColumn = `span ${widget.width}`;
    widgetEl.style.gridRow = `span ${widget.height}`;

    // FIX: Using data-action and data-id instead of inline onclick
    widgetEl.innerHTML = `
        <div class="widget-actions">
            <button class="icon-btn settings" data-action="settings" data-id="${widget.id}">⚙️</button>
            <button class="icon-btn delete" data-action="delete" data-id="${widget.id}">🗑️</button>
        </div>
        <div class="widget-header">${widget.title}</div>
        <div class="widget-content" id="content-${widget.id}">
            <div style="text-align:center; padding: 20px; color: #888;">
                Click ⚙️ to configure this widget.
            </div>
        </div>
    `;
    canvas.appendChild(widgetEl);
}

function createWidgetOnCanvas(type) {
    const config = widgetDefaults[type];
    widgetIdCounter++;
    const widgetId = `widget-${widgetIdCounter}`;
    const newWidget = { ...config, id: widgetId };
    
    activeWidgets[widgetId] = newWidget;
    buildWidgetDOM(newWidget);
    renderWidget(widgetId);
}

// ==========================================
// 6. EVENT DELEGATION (Fixes the frozen buttons!)
// ==========================================

// Listens for clicks anywhere on the Canvas (Gear & Trash icons)
canvas.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (btn.getAttribute('data-action') === 'settings') openSettings(id);
    if (btn.getAttribute('data-action') === 'delete') deleteWidget(id);
});

// Listens for clicks in the Table (Three Dots icon)
tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    openContextMenu(e, btn.getAttribute('data-id'));
});

// Listens for clicks in the Settings Panel (Apply Button)
settingsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('save-settings-btn')) {
        saveWidgetSettings();
    }
});

function deleteWidget(id) {
    if (confirm("Are you sure you want to remove this widget?")) {
        const widget = document.getElementById(id);
        if (widget) widget.remove();
        delete activeWidgets[id];
        if (canvas.children.length === 0) {
            canvas.innerHTML = '<div class="empty-state">No widgets configured. Click "Configure Dashboard" to start.</div>';
        }
    }
}

// ==========================================
// 7. Dynamic Widget Settings Panel
// ==========================================
function openSettings(id) {
    currentlyEditingWidgetId = id;
    const widget = activeWidgets[id];
    
    let formHTML = `
        <div class="input-group" style="margin-bottom: 12px;">
            <label>Widget title <span class="required">*</span></label>
            <input type="text" id="set-title" value="${widget.title}" required>
        </div>
        <div class="input-group" style="margin-bottom: 12px;">
            <label>Widget type</label>
            <input type="text" value="${widget.type}" readonly class="readonly-field">
        </div>
        <div class="input-group" style="margin-bottom: 12px;">
            <label>Description</label>
            <textarea id="set-desc" rows="2">${widget.description || ''}</textarea>
        </div>
        <div class="form-grid">
            <div class="input-group">
                <label>Width (Columns) <span class="required">*</span></label>
                <input type="number" id="set-width" value="${widget.width}" min="1" max="12" required>
            </div>
            <div class="input-group">
                <label>Height (Rows) <span class="required">*</span></label>
                <input type="number" id="set-height" value="${widget.height}" min="1" required>
            </div>
        </div>
        <hr class="divider">
    `;

    if (widget.type === 'KPI') {
        formHTML += `
            <h3>Data Setting</h3>
            <div class="input-group" style="margin-bottom: 12px;">
                <label>Select metric <span class="required">*</span></label>
                <select id="set-metric" required>
                    <option value="">Select Metric</option>
                    <option value="Total amount">Total amount</option>
                    <option value="Quantity">Quantity</option>
                    <option value="Unit price">Unit price</option>
                </select>
            </div>
            <div class="input-group" style="margin-bottom: 12px;">
                <label>Aggregation <span class="required">*</span></label>
                <select id="set-aggregation" required>
                    <option value="Sum">Sum</option>
                    <option value="Average">Average</option>
                    <option value="Count">Count</option>
                </select>
            </div>
        `;
    } 
    else if (['Bar chart', 'Line chart', 'Area chart', 'Scatter plot chart'].includes(widget.type)) {
        formHTML += `
            <h3>Data Setting</h3>
            <div class="form-grid">
                <div class="input-group">
                    <label>X-Axis <span class="required">*</span></label>
                    <select id="set-x-axis" required>
                        <option value="Product">Product</option>
                        <option value="Created by">Created by</option>
                        <option value="Status">Status</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Y-Axis <span class="required">*</span></label>
                    <select id="set-y-axis" required>
                        <option value="Total amount">Total amount</option>
                        <option value="Quantity">Quantity</option>
                    </select>
                </div>
            </div>
            <hr class="divider">
            <h3>Styling</h3>
            <div class="input-group" style="margin-bottom: 12px;">
                <label>Chart color</label>
                <input type="color" id="set-color" value="${widget.color || '#54bd95'}">
            </div>
        `;
    }
    else if (widget.type === 'Pie chart') {
        formHTML += `
            <h3>Data Setting</h3>
            <div class="input-group" style="margin-bottom: 12px;">
                <label>Choose chart data <span class="required">*</span></label>
                <select id="set-pie-data" required>
                    <option value="Product">Product</option>
                    <option value="Status">Status</option>
                    <option value="Created by">Created by</option>
                </select>
            </div>
            <div class="input-group" style="margin-bottom: 12px; flex-direction: row; gap: 8px;">
                <input type="checkbox" id="set-pie-legend" ${widget.showLegend ? 'checked' : ''}>
                <label style="margin:0;">Show legend</label>
            </div>
        `;
    }
    else if (widget.type === 'Table') {
        const cols = ['Order ID', 'Customer Name', 'Product', 'Quantity', 'Total amount', 'Status', 'Created by'];
        let checkboxes = cols.map(c => `
            <label><input type="checkbox" class="set-table-col" value="${c}" ${(widget.tableCols || []).includes(c) ? 'checked' : ''}> ${c}</label>
        `).join('');

        formHTML += `
            <h3>Data Setting</h3>
            <div class="input-group" style="margin-bottom: 12px;">
                <label>Choose columns <span class="required">*</span></label>
                <div class="multi-select-box">${checkboxes}</div>
            </div>
            <div class="input-group" style="margin-bottom: 12px;">
                <label>Pagination</label>
                <select id="set-table-page">
                    <option value="5">5 Rows</option>
                    <option value="10">10 Rows</option>
                    <option value="15">15 Rows</option>
                </select>
            </div>
            <hr class="divider">
            <h3>Styling</h3>
            <div class="form-grid">
                <div class="input-group">
                    <label>Font size (12-18)</label>
                    <input type="number" id="set-table-font" value="${widget.fontSize || 14}" min="12" max="18">
                </div>
                <div class="input-group">
                    <label>Header background</label>
                    <input type="color" id="set-table-bg" value="${widget.headerBg || '#54bd95'}">
                </div>
            </div>
        `;
    }

    formHTML += `<div class="form-actions"><button type="button" class="btn primary save-settings-btn">Apply Settings</button></div>`;
    settingsContainer.innerHTML = formHTML;
    settingsPanel.classList.remove('hidden');

    if (widget.type === 'KPI' && widget.metric) {
        document.getElementById('set-metric').value = widget.metric;
        document.getElementById('set-aggregation').value = widget.aggregation;
    } else if (['Bar chart', 'Line chart', 'Area chart', 'Scatter plot chart'].includes(widget.type) && widget.xAxis) {
        document.getElementById('set-x-axis').value = widget.xAxis;
        document.getElementById('set-y-axis').value = widget.yAxis;
    } else if (widget.type === 'Pie chart' && widget.pieData) {
        document.getElementById('set-pie-data').value = widget.pieData;
    } else if (widget.type === 'Table' && widget.pagination) {
        document.getElementById('set-table-page').value = widget.pagination;
    }
}

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    currentlyEditingWidgetId = null;
});

function saveWidgetSettings() {
    if (!currentlyEditingWidgetId) return;
    const widget = activeWidgets[currentlyEditingWidgetId];
    
    widget.title = document.getElementById('set-title').value;
    widget.description = document.getElementById('set-desc').value;
    widget.width = parseInt(document.getElementById('set-width').value);
    widget.height = parseInt(document.getElementById('set-height').value);

    if (widget.type === 'KPI') {
        widget.metric = document.getElementById('set-metric').value;
        widget.aggregation = document.getElementById('set-aggregation').value;
    } else if (['Bar chart', 'Line chart', 'Area chart', 'Scatter plot chart'].includes(widget.type)) {
        widget.xAxis = document.getElementById('set-x-axis').value;
        widget.yAxis = document.getElementById('set-y-axis').value;
        widget.color = document.getElementById('set-color').value;
    } else if (widget.type === 'Pie chart') {
        widget.pieData = document.getElementById('set-pie-data').value;
        widget.showLegend = document.getElementById('set-pie-legend').checked;
    } else if (widget.type === 'Table') {
        const checkedBoxes = document.querySelectorAll('.set-table-col:checked');
        widget.tableCols = Array.from(checkedBoxes).map(cb => cb.value);
        widget.pagination = parseInt(document.getElementById('set-table-page').value);
        widget.fontSize = document.getElementById('set-table-font').value;
        widget.headerBg = document.getElementById('set-table-bg').value;
    }

    const widgetDOM = document.getElementById(currentlyEditingWidgetId);
    widgetDOM.style.gridColumn = `span ${widget.width}`;
    widgetDOM.style.gridRow = `span ${widget.height}`;
    widgetDOM.querySelector('.widget-header').textContent = widget.title;

    settingsPanel.classList.add('hidden');
    renderWidget(currentlyEditingWidgetId);
    currentlyEditingWidgetId = null;
}

// ==========================================
// 8. Date Filtering Logic
// ==========================================
document.getElementById('date-filter').addEventListener('change', updateAllWidgets);

function getFilteredOrders() {
    const filterVal = document.getElementById('date-filter').value;
    if (filterVal === 'all-time') return customerOrders;

    const now = new Date();
    return customerOrders.filter(order => {
        const orderDate = new Date(order.orderDate);
        const diffTime = Math.abs(now - orderDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (filterVal === 'today') return diffDays <= 1;
        if (filterVal === '7-days') return diffDays <= 7;
        if (filterVal === '30-days') return diffDays <= 30;
        if (filterVal === '90-days') return diffDays <= 90;
        return true;
    });
}

// ==========================================
// 9. Universal Chart & Widget Rendering 
// ==========================================
function renderWidget(widgetId) {
    const widget = activeWidgets[widgetId];
    const contentDiv = document.getElementById(`content-${widgetId}`);
    if (!widget || !contentDiv) return;

    const dataToUse = getFilteredOrders();

    if (widget.type === 'KPI') {
        if (!widget.metric || !widget.aggregation) return;
        let value = 0;
        if (widget.aggregation === 'Count') {
            value = dataToUse.length;
        } else {
            let sum = 0;
            const propMap = { 'Total amount': 'totalAmount', 'Quantity': 'quantity', 'Unit price': 'unitPrice' };
            const prop = propMap[widget.metric];
            dataToUse.forEach(order => sum += order[prop]);
            value = widget.aggregation === 'Average' ? (dataToUse.length ? sum / dataToUse.length : 0) : sum;
        }
        let prefix = widget.metric.includes('amount') || widget.metric.includes('price') ? '$' : '';
        contentDiv.innerHTML = `<div style="font-size: 2.5rem; font-weight: bold; color: ${widget.color || 'var(--text-main)'};">${prefix}${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>`;
    } 
    else if (widget.type === 'Table') {
        if (!widget.tableCols || widget.tableCols.length === 0) return;
        
        const pageData = dataToUse.slice(0, widget.pagination || 5);
        
        let tableHTML = `<div class="widget-table-container"><table class="widget-table" style="font-size: ${widget.fontSize || 14}px;">`;
        tableHTML += `<thead><tr>`;
        widget.tableCols.forEach(col => {
            tableHTML += `<th style="background-color: ${widget.headerBg || '#54bd95'};">${col}</th>`;
        });
        tableHTML += `</tr></thead><tbody>`;
        
        const dataMap = {
            'Order ID': 'id',
            'Customer Name': order => `${order.firstName} ${order.lastName}`,
            'Product': 'product',
            'Quantity': 'quantity',
            'Total amount': order => `$${order.totalAmount.toFixed(2)}`,
            'Status': 'status',
            'Created by': 'createdBy'
        };

        pageData.forEach(order => {
            tableHTML += `<tr>`;
            widget.tableCols.forEach(col => {
                const key = dataMap[col];
                const cellValue = typeof key === 'function' ? key(order) : order[key];
                tableHTML += `<td>${cellValue}</td>`;
            });
            tableHTML += `</tr>`;
        });
        
        tableHTML += `</tbody></table></div>`;
        contentDiv.innerHTML = tableHTML;
    }
    else if (['Bar chart', 'Line chart', 'Area chart', 'Scatter plot chart', 'Pie chart'].includes(widget.type)) {
        if (widget.type !== 'Pie chart' && (!widget.xAxis || !widget.yAxis)) return;
        if (widget.type === 'Pie chart' && !widget.pieData) return;

        const groupedData = {};
        
        if (widget.type === 'Pie chart') {
            const piePropMap = { 'Product': 'product', 'Created by': 'createdBy', 'Status': 'status' };
            const prop = piePropMap[widget.pieData];
            dataToUse.forEach(order => {
                const val = order[prop];
                if (!groupedData[val]) groupedData[val] = 0;
                groupedData[val] += 1;
            });
        } else {
            const xPropMap = { 'Product': 'product', 'Created by': 'createdBy', 'Status': 'status' };
            const yPropMap = { 'Total amount': 'totalAmount', 'Quantity': 'quantity' };
            const xProp = xPropMap[widget.xAxis];
            const yProp = yPropMap[widget.yAxis];

            dataToUse.forEach(order => {
                const xValue = order[xProp];
                const yValue = order[yProp];
                if (!groupedData[xValue]) groupedData[xValue] = 0;
                groupedData[xValue] += yValue;
            });
        }

        const labels = Object.keys(groupedData);
        const dataPoints = Object.values(groupedData);

        contentDiv.innerHTML = `<canvas id="canvas-${widgetId}"></canvas>`;
        const ctx = document.getElementById(`canvas-${widgetId}`).getContext('2d');

        if (chartInstances[widgetId]) chartInstances[widgetId].destroy();

        let chartType = 'bar';
        let fillArea = false;
        let showLine = true;
        let bgColors = widget.color || '#54bd95';

        if (widget.type === 'Line chart') chartType = 'line';
        if (widget.type === 'Area chart') { chartType = 'line'; fillArea = true; bgColors = widget.color ? widget.color + '80' : 'rgba(84, 189, 149, 0.5)'; }
        if (widget.type === 'Scatter plot chart') { chartType = 'line'; showLine = false; }
        if (widget.type === 'Pie chart') {
            chartType = 'pie';
            bgColors = ['#54bd95', '#f39c12', '#e74c3c', '#9b59b6', '#3498db', '#34495e'];
        }

        chartInstances[widgetId] = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: widget.yAxis || widget.pieData,
                    data: dataPoints,
                    backgroundColor: bgColors,
                    borderColor: widget.type === 'Pie chart' ? '#fff' : (widget.color || '#54bd95'),
                    borderWidth: 2,
                    fill: fillArea,
                    showLine: showLine,
                    pointRadius: widget.type === 'Scatter plot chart' ? 6 : 3,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: widget.type === 'Pie chart' ? widget.showLegend : false } },
                scales: widget.type === 'Pie chart' ? {} : { y: { beginAtZero: true } }
            }
        });
    }
}

function updateAllWidgets() {
    Object.keys(activeWidgets).forEach(id => renderWidget(id));
}

// ==========================================
// 10. Customer Order Form & Main Table Logic
// ==========================================
const orderForm = document.getElementById('create-order-form');
const qtyInput = document.getElementById('quantity');
const priceInput = document.getElementById('unit-price');
const totalInput = document.getElementById('total-amount');

function calculateTotal() {
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    totalInput.value = (qty * price).toFixed(2); 
}

qtyInput.addEventListener('input', calculateTotal);
priceInput.addEventListener('input', calculateTotal);

orderForm.addEventListener('submit', (e) => {
    e.preventDefault(); 
    if (!orderForm.checkValidity()) {
        orderForm.reportValidity();
        return;
    }

    const orderData = {
        firstName: document.getElementById('first-name').value,
        lastName: document.getElementById('last-name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        street: document.getElementById('street').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        postalCode: document.getElementById('postal-code').value,
        country: document.getElementById('country').value,
        product: document.getElementById('product').value,
        quantity: parseInt(qtyInput.value),
        unitPrice: parseFloat(priceInput.value),
        totalAmount: parseFloat(totalInput.value),
        status: document.getElementById('status').value,
        createdBy: document.getElementById('created-by').value
    };

    if (selectedOrderId) {
        const orderToEdit = customerOrders.find(order => order.id === selectedOrderId);
        if(orderToEdit) {
            const orderRef = doc(db, "orders", orderToEdit.dbId);
            updateDoc(orderRef, orderData);
        }
        selectedOrderId = null; 
    } else {
        orderData.id = 'ORD-' + Math.floor(Math.random() * 10000); 
        orderData.orderDate = new Date().toISOString().split('T')[0]; 
        addDoc(collection(db, "orders"), orderData);
    }
    
    orderForm.reset();
    orderModal.classList.add('hidden');
});

function renderCustomerTable() {
    tableBody.innerHTML = '';
    if (customerOrders.length === 0) {
        tableBody.innerHTML = `
            <tr id="empty-table-row">
                <td colspan="8" style="text-align: center; padding: 24px; color: #888;">
                    No data exists. Click "Create Order" to add.
                </td>
            </tr>`;
        return;
    }
    customerOrders.forEach(order => {
        const row = document.createElement('tr');
        // FIX: Using data-id to make the three dots work!
        row.innerHTML = `
            <td>${order.id}</td>
            <td>${order.firstName} ${order.lastName}</td>
            <td>${order.product}</td>
            <td>${order.quantity}</td>
            <td>$${order.totalAmount.toFixed(2)}</td>
            <td>${order.status}</td>
            <td>${order.createdBy}</td>
            <td>
                <button class="action-btn" data-id="${order.id}">⋮</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function openContextMenu(event, orderId) {
    selectedOrderId = orderId;
    
    // Smart Positioning: Calculate if we are too close to the bottom of the screen
    const menuHeight = 100; // approximate height of the menu
    let topPosition = event.pageY;
    
    // If the mouse click is too close to the bottom window edge, pop the menu UP
    if (window.innerHeight - event.clientY < menuHeight) {
        topPosition = event.pageY - menuHeight + 20; 
    }

    contextMenu.style.left = `${event.pageX - 120}px`; 
    contextMenu.style.top = `${topPosition}px`;
    contextMenu.classList.remove('hidden');
    event.stopPropagation();
}

document.addEventListener('click', () => {
    contextMenu.classList.add('hidden');
});

document.getElementById('menu-delete').addEventListener('click', () => {
    if (confirm("Are you sure you want to delete this order?")) {
        const orderToEdit = customerOrders.find(order => order.id === selectedOrderId);
        if (orderToEdit) {
            deleteDoc(doc(db, "orders", orderToEdit.dbId));
        }
    }
});

document.getElementById('menu-edit').addEventListener('click', () => {
    const orderToEdit = customerOrders.find(order => order.id === selectedOrderId);
    if (!orderToEdit) return;

    document.getElementById('first-name').value = orderToEdit.firstName;
    document.getElementById('last-name').value = orderToEdit.lastName;
    document.getElementById('email').value = orderToEdit.email;
    document.getElementById('phone').value = orderToEdit.phone;
    document.getElementById('street').value = orderToEdit.street;
    document.getElementById('city').value = orderToEdit.city;
    document.getElementById('state').value = orderToEdit.state;
    document.getElementById('postal-code').value = orderToEdit.postalCode;
    document.getElementById('country').value = orderToEdit.country;
    document.getElementById('product').value = orderToEdit.product;
    document.getElementById('quantity').value = orderToEdit.quantity;
    document.getElementById('unit-price').value = orderToEdit.unitPrice;
    document.getElementById('total-amount').value = orderToEdit.totalAmount;
    document.getElementById('status').value = orderToEdit.status;
    document.getElementById('created-by').value = orderToEdit.createdBy;

    contextMenu.classList.add('hidden');
    orderModal.classList.remove('hidden');
});

// ==========================================
// 11. Real Firebase Login, Sign Up & UX Flow
// ==========================================
const loginScreen = document.getElementById('login-screen');
const loaderScreen = document.getElementById('loader-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');

// New Auth DOM Elements
const togglePasswordBtn = document.getElementById('toggle-password');
const loginPasswordInput = document.getElementById('login-password');
const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');

let isSignUpMode = false;

// 1. Show/Hide Password Toggle
togglePasswordBtn.addEventListener('click', () => {
    const isPassword = loginPasswordInput.getAttribute('type') === 'password';
    loginPasswordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePasswordBtn.textContent = isPassword ? 'Hide' : 'Show';
});

// 2. Switch between Login and Sign Up Mode
toggleAuthModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;
    
    if (isSignUpMode) {
        authTitle.textContent = "Create an Account";
        authSubtitle.textContent = "Sign up to start building";
        authSubmitBtn.textContent = "Sign Up";
        toggleAuthModeBtn.textContent = "Sign in instead";
        authSwitchText.textContent = "Already have an account? ";
    } else {
        authTitle.textContent = "Welcome Back";
        authSubtitle.textContent = "Sign in to access your workspace";
        authSubmitBtn.textContent = "Sign In";
        toggleAuthModeBtn.textContent = "Create new user";
        authSwitchText.textContent = "Don't have an account? ";
    }
});

// 3. Legit Firebase Auth Submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        // Disable button while processing
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = "Processing...";

        if (isSignUpMode) {
            // Firebase Sign Up
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            // Firebase Sign In
            await signInWithEmailAndPassword(auth, email, password);
        }

        // Authentication Succeeded!
        loginScreen.classList.add('hidden');
        loaderScreen.classList.remove('hidden');
        
        // Brief artificial delay for the cool "Decrypting workspace..." UI
        setTimeout(() => {
            loaderScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            updateAllWidgets(); 
        }, 1000);

    } catch (error) {
        // If login fails, show Firebase error and reset button
        alert(error.message.replace('Firebase: ', ''));
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isSignUpMode ? "Sign Up" : "Sign In";
    }
});

// 4. Logout Functionality
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await signOut(auth); // Tell Firebase we signed out
            appContainer.classList.add('hidden');
            loginScreen.classList.remove('hidden');
            // Reset form
            loginForm.reset();
            loginPasswordInput.setAttribute('type', 'password');
            togglePasswordBtn.textContent = 'Show';
        } catch (error) {
            alert("Error signing out.");
        }
    });
}