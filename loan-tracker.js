// loan-tracker.js
// Main logic for Loan Tracker

// --- Data Management (Firebase) ---
// Global cache for UI updates
let cachedLoans = [];

function getLoans(callback) {
    db.ref('loans').once('value').then(snapshot => {
        cachedLoans = snapshot.val() || [];
        callback(cachedLoans);
    });
}

function saveLoans(loans, callback) {
    db.ref('loans').set(loans, callback);
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
        // Calculate end date
        let start = loan.startDate ? new Date(loan.startDate) : new Date();
        if (!loan.startDate) loan.startDate = start.toISOString();
        let end = new Date(start);
        end.setMonth(end.getMonth() + Number(loan.tenure));
        const endMonth = end.toLocaleString('default', { month: 'short' });
        const endYear = end.getFullYear();
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
    <div class="mb-2"><b>EMI:</b> ₹${calcEMI(loan.principal, loan.interest, loan.tenure)}</div>
    <div class="mb-2 d-flex gap-2">
      <button class="btn btn-primary btn-sm" onclick="saveLoanEdits(${idx})">Save Changes</button>
      <button class="btn btn-secondary btn-sm" onclick="downloadStatement(${idx})">Download Statement</button>
    </div>
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
}

// Save edits to principal, interest, tenure
function saveLoanEdits(idx) {
    const loans = cachedLoans;
    const loan = loans[idx];
    const newPrincipal = Number(document.getElementById('editPrincipal').value);
    const newInterest = Number(document.getElementById('editInterest').value);
    const newTenure = Number(document.getElementById('editTenure').value);
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
    let tenure = loan.tenure;
    // Ensure startDate is set
    let startDate = loan.startDate ? new Date(loan.startDate) : new Date();
    for (let m = 0; m < tenure; m++) {
        let row = loan.statement[m];
        let rate = row.interestRate || loan.interest;
        let emi = calcEMI(pending, rate, tenure-m);
        let interestPaid = Math.round(pending * rate/12/100);
        let principalPaid = emi - interestPaid;
        let partPayment = Number(row.partPayment)||0;
        row.emi = emi;
        row.interestPaid = interestPaid;
        row.principalPaid = principalPaid;
        // Update date for this EMI
        let emiDate = new Date(startDate);
        emiDate.setMonth(emiDate.getMonth() + m);
        row.date = emiDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        pending -= (principalPaid + partPayment);
        row.pending = Math.max(0, Math.round(pending));
    }
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
        const loans = getLoans();
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
    // Load from Firebase and render
    getLoans(function(loans) {
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
