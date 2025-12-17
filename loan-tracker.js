
// loan-tracker.js
// Main logic for Loan Tracker

// === Version Info (update here for both developer and end user) ===

const APP_VERSION = '1.2.1';
const APP_LAST_UPDATED = '2025-12-17';
// Version: 1.2.1
// Last Updated: 2025-12-17

// Version History:
// 1.2.1 - 2025-12-17: Burn down chart moved above statement, minor UI improvements
// 1.2.0 - 2025-12-16: End date reflects real closure, tenure/EMI preserved, version header added
// 1.1.0 - 2025-12-15: Part payment reduces tenure, not EMI
// 1.0.0 - Initial version

// --- Data Management (Firebase) ---
// Global cache for UI updates
let cachedLoans = [];


function listenToLoans(callback) {
    db.ref('loans').on('value', snapshot => {
        const data = snapshot.val() || [];
        console.log('Loaded loans from Firebase:', data);
        cachedLoans = data;
        callback(cachedLoans);
    }, function(error) {
        console.error('Error loading loans:', error);
    });
}

function saveLoans(loans, callback) {
    console.log('Saving loans to Firebase:', loans);
    db.ref('loans').set(loans, function(error) {
        if (error) {
            console.error('Error saving loans:', error);
        } else {
            console.log('Loans saved successfully');
        }
        if (callback) callback(error);
    });
    cachedLoans = loans;
}

// --- UI Rendering ---
function renderLoanList() {
    const loans = cachedLoans;
    const list = document.getElementById('loanList');
    list.innerHTML = '';
    loans.forEach((loan, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        const info = document.createElement('span');
        info.className = 'flex-grow-1 loan-info';
        info.style.cursor = 'pointer';
        // Calculate end date based on actual closure (last EMI in statement)
        let endMonth, endYear;
        if (loan.statement && loan.statement.length > 0) {
            const lastRow = loan.statement[loan.statement.length - 1];
            if (lastRow.date) {
                const [month, year] = lastRow.date.split(' ');
                endMonth = month;
                endYear = year;
            } else {
                // fallback to original logic
                let start = loan.startDate ? new Date(loan.startDate) : new Date();
                if (!loan.startDate) loan.startDate = start.toISOString();
                let end = new Date(start);
                end.setMonth(end.getMonth() + Number(loan.tenure));
                endMonth = end.toLocaleString('default', { month: 'short' });
                endYear = end.getFullYear();
            }
        } else {
            // fallback to original logic
            let start = loan.startDate ? new Date(loan.startDate) : new Date();
            if (!loan.startDate) loan.startDate = start.toISOString();
            let end = new Date(start);
            end.setMonth(end.getMonth() + Number(loan.tenure));
            endMonth = end.toLocaleString('default', { month: 'short' });
            endYear = end.getFullYear();
        }
        info.textContent = `${loan.principal} @ ${loan.interest}% for ${loan.tenure}m (Ends: ${endMonth} ${endYear})`;
        info.onclick = () => showLoanDetails(idx);
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-sm ms-2';
        delBtn.textContent = 'Delete';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteLoan(idx); };
        li.appendChild(info);
        li.appendChild(delBtn);
        list.appendChild(li);
    });
    document.getElementById('totalLoans').textContent = loans.length;
}

// --- Delete Loan ---
function deleteLoan(idx) {
    if (!confirm('Are you sure you want to delete this loan?')) return;
    const loans = cachedLoans;
    loans.splice(idx, 1);
    saveLoans(loans, () => {
        document.getElementById('loanDetails').innerHTML = '';
        renderLoanList();
        updatePieCharts();
    });
}

function showLoanDetails(idx) {
    const loans = cachedLoans;
    const loan = loans[idx];
    if (!loan) return;
    if (!loan.statement) loan.statement = generateStatement(loan);
    renderLoanDetails(idx, loan);
    updatePieCharts(loan);
}

function renderLoanDetails(idx, loan) {
    const container = document.getElementById('loanDetails');
        let html = `<h4>Loan Details</h4>
            <div class="mb-2">
                <label><b>Principal:</b> <input id="editPrincipal" type="number" min="1" value="${loan.principal}" style="width:120px"></label>
            </div>
            <div class="mb-2">
                <label><b>Interest Rate:</b> <input id="editInterest" type="number" min="0" step="0.01" value="${loan.interest}" style="width:80px">%</label>
            </div>
            <div class="mb-2">
                <label><b>Tenure:</b> <input id="editTenure" type="number" min="1" value="${loan.tenure}" style="width:80px"> months</label>
            </div>
            <div class="mb-2"><b>Original Tenure:</b> ${loan.originalTenure || loan.tenure} months</div>
            <div class="mb-2"><b>Original EMI:</b> ₹${loan.originalEMI || calcEMI(loan.principal, loan.interest, loan.tenure)}</div>
            <div class="mb-2"><b>Current Tenure (after part payments):</b> ${loan.statement ? loan.statement.length : loan.tenure} months</div>
            <div class="mb-2"><b>EMI:</b> ₹${loan.originalEMI || calcEMI(loan.principal, loan.interest, loan.tenure)}</div>
            <div class="mb-2 d-flex gap-2">
                <button class="btn btn-primary btn-sm" onclick="saveLoanEdits(${idx})">Save Changes</button>
                <button class="btn btn-secondary btn-sm" onclick="downloadStatement(${idx})">Download Statement</button>
            </div>
            <div class="mt-4"><h5>Loan Burn Down</h5><canvas id="burnDownChart" height="120"></canvas></div>
            <div class="table-responsive"><table class="table table-bordered statement-table">
            <thead><tr><th>Month</th><th>Date</th><th>EMI</th><th>Principal Paid</th><th>Interest Paid</th><th>Part Payment</th><th>Interest Rate</th><th>Pending</th></tr></thead><tbody>`;
        loan.statement.forEach((row, i) => {
            html += `<tr>
                <td>${i+1}</td>
                <td>${row.date || ''}</td>
                <td>₹${row.emi}</td>
                <td>₹${row.principalPaid}</td>
                <td>₹${row.interestPaid}</td>
                <td><input type="number" min="0" value="${row.partPayment||''}" onchange="updatePartPayment(${idx},${i},this.value)"></td>
                <td><input type="number" min="0" step="0.01" value="${row.interestRate||loan.interest}" onchange="updateInterestRate(${idx},${i},this.value)"></td>
                <td>₹${row.pending}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
        // Draw the burn down chart
        setTimeout(() => drawBurnDownChart(loan), 0);
// --- Burn Down Chart ---
function drawBurnDownChart(loan) {
    const ctx = document.getElementById('burnDownChart');
    if (!ctx) return;
    // Clean up previous chart if exists
    if (window.burnDownChartInstance) {
        window.burnDownChartInstance.destroy();
    }
    // Actual burn down
    const actualLabels = loan.statement.map((row, i) => row.date || `M${i+1}`);
    const actualData = loan.statement.map(row => row.pending);

    // Original plan burn down (no part payments)
    let origPending = loan.principal;
    let origEMI = loan.originalEMI || calcEMI(loan.principal, loan.interest, loan.tenure);
    let origRate = loan.interest;
    let origTenure = loan.originalTenure || loan.tenure;
    let origStartDate = loan.startDate ? new Date(loan.startDate) : new Date();
    let origPlan = [];
    let origLabels = [];
    for (let m = 1; m <= origTenure; m++) {
        let interestPaid = Math.round(origPending * origRate/12/100);
        let principalPaid = origEMI - interestPaid;
        origPending -= principalPaid;
        origPlan.push(Math.max(0, Math.round(origPending)));
        let emiDate = new Date(origStartDate);
        emiDate.setMonth(emiDate.getMonth() + (m-1));
        origLabels.push(emiDate.toLocaleString('default', { month: 'short', year: 'numeric' }));
        if (origPending <= 0) break;
    }

    // Use the longer of the two for labels
    const maxLen = Math.max(actualLabels.length, origLabels.length);
    const chartLabels = [];
    for (let i = 0; i < maxLen; i++) {
        chartLabels.push(actualLabels[i] || origLabels[i] || `M${i+1}`);
    }
    // Pad data arrays to same length
    const actualDataPadded = [...actualData];
    while (actualDataPadded.length < maxLen) actualDataPadded.push(null);
    const origPlanPadded = [...origPlan];
    while (origPlanPadded.length < maxLen) origPlanPadded.push(null);

    window.burnDownChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Actual Pending Principal',
                    data: actualDataPadded,
                    borderColor: '#e53935',
                    backgroundColor: 'rgba(229,57,53,0.08)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 2,
                    pointBackgroundColor: '#e53935',
                    pointBorderColor: '#fff',
                },
                {
                    label: 'Original Plan',
                    data: origPlanPadded,
                    borderColor: '#1976d2',
                    backgroundColor: 'rgba(25,118,210,0.07)',
                    fill: false,
                    borderDash: [6,4],
                    tension: 0.2,
                    pointRadius: 2,
                    pointBackgroundColor: '#1976d2',
                    pointBorderColor: '#fff',
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: 'top' },
                title: { display: false }
            },
            scales: {
                x: { title: { display: true, text: 'Month' } },
                y: { title: { display: true, text: 'Pending Principal (₹)' }, beginAtZero: true }
            }
        }
    });
}
}

// Save edits to principal, interest, tenure
function saveLoanEdits(idx) {
    const loans = cachedLoans;
    const loan = loans[idx];
    const newPrincipal = Number(document.getElementById('editPrincipal').value);
    const newInterest = Number(document.getElementById('editInterest').value);
    const newTenure = Number(document.getElementById('editTenure').value);
    // Preserve original values if not already set
    if (loan.originalTenure === undefined) loan.originalTenure = loan.tenure;
    if (loan.originalEMI === undefined) loan.originalEMI = calcEMI(loan.principal, loan.interest, loan.tenure);
    // If any value changed, update and recalc
    if (loan.principal !== newPrincipal || loan.interest !== newInterest || loan.tenure !== newTenure) {
        // Save old part payments and interest rates if possible
        let oldStatement = loan.statement || [];
        loan.principal = newPrincipal;
        loan.interest = newInterest;
        loan.tenure = newTenure;
        loan.statement = generateStatement(loan);
        // Restore part payments and custom interest rates for overlapping months
        for (let i = 0; i < Math.min(oldStatement.length, loan.statement.length); i++) {
            loan.statement[i].partPayment = oldStatement[i].partPayment || 0;
            loan.statement[i].interestRate = oldStatement[i].interestRate || loan.interest;
        }
        // Recalculate statement to ensure date is set for all rows
        recalcStatement(loan);
        saveLoans(loans, () => {
            renderLoanDetails(idx, loan);
            updatePieCharts(loan);
        });
    }
}


// --- Loan Calculation ---
function calcEMI(P, R, N) {
    const r = R/12/100;
    return Math.round(P * r * Math.pow(1+r,N) / (Math.pow(1+r,N)-1));
}

function generateStatement(loan) {
    let { principal, interest, tenure } = loan;
    let pending = principal;
    let statement = [];
    let currentRate = interest;
    // Determine start date
    let startDate = loan.startDate ? new Date(loan.startDate) : new Date();
    for (let m = 1; m <= tenure; m++) {
        let row = {};
        row.interestRate = currentRate;
        let emi = calcEMI(pending, currentRate, tenure-m+1);
        let interestPaid = Math.round(pending * currentRate/12/100);
        let principalPaid = emi - interestPaid;
        row.emi = emi;
        row.interestPaid = interestPaid;
        row.principalPaid = principalPaid;
        row.partPayment = 0;
        // Calculate date for this EMI
        let emiDate = new Date(startDate);
        emiDate.setMonth(emiDate.getMonth() + (m-1));
        row.date = emiDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        pending -= principalPaid;
        row.pending = Math.max(0, Math.round(pending));
        statement.push(row);
    }
    return statement;
}

function updatePartPayment(loanIdx, monthIdx, value) {
    const loans = cachedLoans;
    const loan = loans[loanIdx];
    loan.statement[monthIdx].partPayment = Number(value)||0;
    recalcStatement(loan);
    saveLoans(loans, () => {
        renderLoanDetails(loanIdx, loan);
    });
}

function updateInterestRate(loanIdx, monthIdx, value) {
    const loans = cachedLoans;
    const loan = loans[loanIdx];
    loan.statement[monthIdx].interestRate = Number(value)||loan.interest;
    recalcStatement(loan);
    saveLoans(loans, () => {
        renderLoanDetails(loanIdx, loan);
    });
}

function recalcStatement(loan) {
    let pending = loan.principal;
    let startDate = loan.startDate ? new Date(loan.startDate) : new Date();
    let m = 0;
    // Always use the original EMI for recalculation
    let fixedEMI = loan.originalEMI || calcEMI(loan.principal, loan.interest, loan.tenure);
    while (pending > 0.5 && m < 600) { // safety limit
        let row = loan.statement[m] || {};
        let rate = row.interestRate || loan.interest;
        let emi = fixedEMI;
        let interestPaid = Math.round(pending * rate/12/100);
        let principalPaid = emi - interestPaid;
        let partPayment = Number(row.partPayment)||0;
        // If last payment, adjust EMI to not overpay
        if (pending - (principalPaid + partPayment) < -0.5) {
            principalPaid = pending - partPayment;
            emi = principalPaid + interestPaid;
        }
        row.emi = Math.max(0, Math.round(emi));
        row.interestPaid = interestPaid;
        row.principalPaid = Math.max(0, Math.round(principalPaid));
        // Update date for this EMI
        let emiDate = new Date(startDate);
        emiDate.setMonth(emiDate.getMonth() + m);
        row.date = emiDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        pending -= (principalPaid + partPayment);
        row.pending = Math.max(0, Math.round(pending));
        loan.statement[m] = row;
        m++;
    }
    // Remove any extra rows if tenure reduced
    loan.statement = loan.statement.slice(0, m);
    // Do NOT update loan.tenure here; keep original for reference
}

// --- Pie Charts ---
function updatePieCharts(selectedLoan) {
    let totalPrincipalPaid = 0, totalInterestPaid = 0, totalPartPaid = 0, totalPaid = 0, totalPrincipal = 0;
    let loanName = '';
    if (selectedLoan) {
        selectedLoan.statement?.forEach(row => {
            totalPrincipalPaid += row.principalPaid;
            totalInterestPaid += row.interestPaid;
            totalPartPaid += Number(row.partPayment)||0;
        });
        totalPrincipal = selectedLoan.principal;
        loanName = selectedLoan.name || `Loan`;
    } else {
        const loans = cachedLoans;
        loans.forEach((loan, idx) => {
            loan.statement?.forEach(row => {
                totalPrincipalPaid += row.principalPaid;
                totalInterestPaid += row.interestPaid;
                totalPartPaid += Number(row.partPayment)||0;
            });
            totalPrincipal += loan.principal;
        });
        loanName = 'All Loans';
    }
    totalPaid = totalPrincipalPaid + totalInterestPaid + totalPartPaid;
    // Pie 1: % of total paid
    drawPie('piePaid',
        [totalPrincipalPaid, totalInterestPaid, totalPartPaid],
        ['Principal Paid', 'Interest Paid', 'Part Payment'],
        [
            `Principal: ₹${totalPrincipalPaid} (${((totalPrincipalPaid/totalPaid)*100||0).toFixed(1)}%)`,
            `Interest: ₹${totalInterestPaid} (${((totalInterestPaid/totalPaid)*100||0).toFixed(1)}%)`,
            `Part Payment: ₹${totalPartPaid} (${((totalPartPaid/totalPaid)*100||0).toFixed(1)}%)`
        ]
    );
    // Pie 2: % of total principal
    drawPie('piePrincipal',
        [totalPrincipalPaid, totalInterestPaid, totalPartPaid],
        ['Principal Paid', 'Interest Paid', 'Part Payment'],
        [
            `Principal: ₹${totalPrincipalPaid} (${((totalPrincipalPaid/totalPrincipal)*100||0).toFixed(1)}%)`,
            `Interest: ₹${totalInterestPaid} (${((totalInterestPaid/totalPrincipal)*100||0).toFixed(1)}%)`,
            `Part Payment: ₹${totalPartPaid} (${((totalPartPaid/totalPrincipal)*100||0).toFixed(1)}%)`
        ]
    );
}

let pieCharts = {};
function drawPie(id, data, labels, legendLabels) {
    const ctx = document.getElementById(id).getContext('2d');
    if (pieCharts[id]) pieCharts[id].destroy();
    pieCharts[id] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: legendLabels,
            datasets: [{
                data,
                backgroundColor: ['#4caf50', '#2196f3', '#ff9800'],
            }]
        },
        options: {
            plugins: {
                legend: { display: true, position: 'bottom' },
                title: { display: true, text: id==='piePaid' ? 'Paid Breakdown (of Total Paid)' : 'Paid Breakdown (of Principal)' }
            }
        }
    });
}

// --- Add Loan ---
document.getElementById('addLoanForm').onsubmit = function(e) {
    e.preventDefault();
    const principal = Number(document.getElementById('principal').value);
    const interest = Number(document.getElementById('interest').value);
    const tenure = Number(document.getElementById('tenure').value);
    let startDateInput = document.getElementById('startDate').value;
    let startDate;
    if (startDateInput) {
        // Use selected date, but set to first day of month for consistency
        let d = new Date(startDateInput);
        d.setDate(1);
        startDate = d.toISOString();
    } else {
        // Default to today, first day of month
        let d = new Date();
        d.setDate(1);
        startDate = d.toISOString();
    }
    const loan = { principal, interest, tenure, startDate };
    loan.statement = generateStatement(loan);
    const loans = cachedLoans;
    loans.push(loan);
    saveLoans(loans, () => {
        renderLoanList();
        document.getElementById('addLoanForm').reset();
        var modal = bootstrap.Modal.getInstance(document.getElementById('addLoanModal'));
        modal.hide();
    });
        // Set original tenure and EMI on loan creation
        loan.originalTenure = tenure;
        loan.originalEMI = calcEMI(principal, interest, tenure);
};

// --- Download Statement ---
function downloadStatement(idx) {
    const loans = cachedLoans;
    const loan = loans[idx];
    let csv = 'Month,Date,EMI,Principal Paid,Interest Paid,Part Payment,Interest Rate,Pending\n';
    loan.statement.forEach((row, i) => {
        csv += `${i+1},${row.date || ''},${row.emi},${row.principalPaid},${row.interestPaid},${row.partPayment||0},${row.interestRate||loan.interest},${row.pending}\n`;
    });
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loan-statement-${idx+1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Init ---
window.onload = function() {
    // Show version and last updated date to user
    // Place version/date info at top right of page
    if (!document.getElementById('versionInfo')) {
        const versionInfo = document.createElement('div');
        versionInfo.id = 'versionInfo';
        versionInfo.style.position = 'absolute';
        versionInfo.style.top = '12px';
        versionInfo.style.right = '24px';
        versionInfo.style.fontSize = '0.98em';
        versionInfo.style.color = '#444';
        versionInfo.style.background = 'rgba(255,255,255,0.85)';
        versionInfo.style.padding = '4px 14px';
        versionInfo.style.borderRadius = '8px';
        versionInfo.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)';
        versionInfo.style.zIndex = '1000';
        versionInfo.innerHTML = `<b>Loan Tracker</b> &mdash; Version: ${APP_VERSION} &nbsp;|&nbsp; Last Updated: ${APP_LAST_UPDATED}`;
        document.body.appendChild(versionInfo);
    }

    // Real-time sync from Firebase
    listenToLoans(function(loans) {
        // Fix: recalculate statement for all loans if date is missing
        let changed = false;
        loans.forEach(loan => {
            if (loan.statement && loan.statement.length > 0 && (!loan.statement[0].date)) {
                loan.statement = generateStatement(loan);
                changed = true;
            }
        });
        if (changed) saveLoans(loans);
        renderLoanList();
        updatePieCharts();
    });
};
