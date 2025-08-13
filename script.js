/* ===========================================
   VMHSS MLP - merged script.js
   Integrated features:
   - per-exam storage, copy names from previous exams
   - add/edit/delete students, save & next, bulk entry
   - keyboard navigation (Enter/Shift+Enter)
   - autosave, backup/import JSON/CSV, exports (CSV/print)
   - mark-all-present, quick-fill, dark mode, search
   - exam comparison chart
   =========================================== */

/* --------------------------
   Global state
   -------------------------- */
let students = [];               // array for current exam
let selectedStudentIndex = null; // index into students
let subjects = [];               // current subjects for the student form / bulk
let currentExam = "";            // e.g. "cycleTest1"
let autoSaveEnabled = false;
let bulkMode = false;
let lastClickedStudentIndex = null; // helpful for Save & Next
const DEFAULT_MAX_WIDTH = 100;   // fallback for max marks

/* --------------------------
   Helpers: storage key per exam
   -------------------------- */
function examStorageKey(examName) {
  return `exam_${examName}`;
}

/* --------------------------
   Subjects & max marks logic
   -------------------------- */
function getSubjects(classValue, sectionValue) {
  if (!classValue) return [];
  const cls = parseInt(classValue);
  if (cls >= 1 && cls <= 10) return ["Tamil", "English", "Maths", "Science", "Social Science"];
  if (cls >= 11) {
    if (["A1", "A2"].includes(sectionValue)) return ["Tamil", "English", "Maths", "Physics", "Chemistry", "Biology"];
    if (sectionValue === "A3") return ["Tamil", "English", "Physics", "Chemistry", "Biology", "Computer Science"];
    if (["B1", "B2", "B3"].includes(sectionValue)) return ["Tamil", "English", "Maths", "Physics", "Chemistry", "Computer Science"];
    if (sectionValue === "C") return ["Tamil", "English", "Economics", "Accountancy", "Commerce", "Computer Application"];
  }
  return [];
}

function getMaxMarksPerSubject(exam) {
  if (!exam) return 100;
  if (exam.startsWith("cycleTest")) return 30;
  if (exam.startsWith("midTerm")) return 50;
  if (["quarterly", "halfYearly", "annual"].includes(exam)) return 100;
  return 100;
}

/* --------------------------
   Save / Load exam data
   -------------------------- */
function saveToLocalStorage() {
  if (!currentExam) return;
  try {
    const key = examStorageKey(currentExam);
    localStorage.setItem(key, JSON.stringify(students));
    if (autoSaveEnabled) {
      localStorage.setItem(`${key}_autosave`, JSON.stringify({timestamp: new Date().toISOString(), students}));
    }
  } catch (e) {
    console.error("Save error:", e);
  }
}

function loadFromLocalStorage(exam = currentExam) {
  if (!exam) return [];
  const key = examStorageKey(exam);
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("Load parse error for", key, e);
    return [];
  }
}

/* --------------------------
   changeExam: called when #examSelect changes
   - supports showing subExamNumberDiv when examSelect is generic (not in this merged HTML case,
     examSelect already contains concrete exams, but we keep compatibility)
   -------------------------- */
function changeExam() {
  const examSelect = document.getElementById("examSelect");
  const subExamNumberDiv = document.getElementById("subExamNumberDiv");
  const subExamNumberSelect = document.getElementById("subExamNumber");
  if (!examSelect) return;

  const value = examSelect.value;
  // if the select gives "cycleTest" or "midTerm", show sub selector
  if (value === "cycleTest" || value === "midTerm") {
    if (subExamNumberDiv) subExamNumberDiv.style.display = "block";
    populateSubExamNumbers(value === "cycleTest" ? 10 : 3, value);
    currentExam = ""; // will be set when sub select chosen
    return;
  }

  // concrete exam selected
  currentExam = value;
  if (subExamNumberDiv) subExamNumberDiv.style.display = "none";

  // load students for this exam
  students = loadFromLocalStorage(currentExam);
  selectedStudentIndex = null;
  subjects = []; // will be derived when user picks class/section or from data
  renderStudentList();
  clearForm();
  populateCopyExamSelect();   // refresh copy-from list
  populateCompareExamSelects(); // refresh compare selects
}

/* --------------------------
   populateSubExamNumbers
   -------------------------- */
function populateSubExamNumbers(maxNum, prefix) {
  const sel = document.getElementById("subExamNumber");
  if (!sel) return;
  sel.innerHTML = `<option value="">Select Test Number</option>`;
  for (let i = 1; i <= maxNum; i++) {
    const opt = document.createElement("option");
    opt.value = `${prefix}${i}`;
    opt.textContent = (prefix === "cycleTest" ? `Cycle Test ${i}` : `Mid Term ${i}`);
    sel.appendChild(opt);
  }
  sel.onchange = function () {
    if (!sel.value) return;
    currentExam = sel.value;
    students = loadFromLocalStorage(currentExam);
    selectedStudentIndex = null;
    renderStudentList();
    clearForm();
    populateCopyExamSelect();
    populateCompareExamSelects();
  };
}

/* --------------------------
   Add student (appends default object and loads it into the form)
   -------------------------- */
function addStudent() {
  if (!currentExam) { alert("Please select an exam first."); return; }
  const newStudent = {
    name: `Student ${students.length + 1}`,
    class: "",
    section: "",
    marks: {},    // object: {subject: number}
    status: {},   // object: {subject: "Present"|"Absent"}
    total: 0,
    average: 0,
    percentage: 0
  };
  students.push(newStudent);
  saveToLocalStorage();
  renderStudentList();
  loadStudent(students.length - 1);
}

/* --------------------------
   Delete student
   -------------------------- */
function deleteStudent(index) {
  if (!confirm("Are you sure you want to delete this student?")) return;
  if (index < 0 || index >= students.length) return;
  students.splice(index, 1);
  saveToLocalStorage();
  renderStudentList();
  clearForm();
}

/* --------------------------
   Render student list on left pane
   - sorts by total desc, but retains original array order for editing
   -------------------------- */
function renderStudentList() {
  const list = document.getElementById("list");
  if (!list) return;
  list.innerHTML = "";

  if (!students || students.length === 0) {
    const summary = document.getElementById("summaryInfo");
    if (summary) summary.innerHTML = "";
    return;
  }

  // ensure each student's totals are computed (if not)
  const maxMarks = getMaxMarksPerSubject(currentExam) || 100;
  students.forEach(s => {
    if (!s.marks) s.marks = {};
    const keys = Object.keys(s.marks);
    if (keys.length === 0) {
      s.total = s.total || 0;
      s.percentage = s.percentage || 0;
      s.average = s.average || 0;
    } else {
      s.total = keys.reduce((a,k) => a + Number(s.marks[k] || 0), 0);
      s.average = keys.length ? s.total / keys.length : 0;
      s.percentage = keys.length ? (s.total / (keys.length * maxMarks) * 100) : 0;
    }
  });

  const sorted = [...students].sort((a,b) => (b.total || 0) - (a.total || 0));
  sorted.forEach((stu, idx) => {
    const origIndex = students.indexOf(stu);
    const li = document.createElement("li");
    li.className = "student";
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.padding = "8px";
    li.style.marginBottom = "6px";
    li.innerHTML = `
      <div style="flex:1;cursor:pointer" onclick="loadStudent(${origIndex})">
        <strong>${idx + 1}. ${stu.name}</strong><br>
        <small>${stu.class || ""} ${stu.section || ""}</small>
      </div>
      <div style="min-width:160px;text-align:right">
        <div>Total: ${stu.total || 0}</div>
        <div style="margin-top:6px">
          <button onclick="loadStudent(${origIndex})">Edit</button>
          <button onclick="deleteStudent(${origIndex})">Delete</button>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  // summary
  const topper = sorted[0];
  const totalAll = students.reduce((a,s) => a + (s.total || 0), 0);
  const avg = students.length ? (totalAll / students.length).toFixed(2) : 0;
  const summaryInfo = document.getElementById("summaryInfo");
  if (summaryInfo) {
    summaryInfo.innerHTML = `🏆 Topper: ${topper.name || ""} - ${topper.total || 0} marks<br>📊 Class Average: ${avg} marks`;
  }
}

/* --------------------------
   load student into the mark form
   -------------------------- */
function loadStudent(index) {
  if (typeof index !== "number" || index < 0 || index >= students.length) return;
  selectedStudentIndex = index;
  lastClickedStudentIndex = index; // for Save & Next flows
  const s = students[index];
  const nameEl = document.getElementById("name");
  const classEl = document.getElementById("class");
  const sectionEl = document.getElementById("section");
  if (nameEl) nameEl.value = s.name || "";
  if (classEl) classEl.value = s.class || "";
  updateSectionOptions(); // repopulate sections
  if (sectionEl) sectionEl.value = s.section || "";

  // determine subjects (prefer stored s.marks keys if present; otherwise derive)
  if (s.marks && Object.keys(s.marks).length > 0) {
    subjects = Object.keys(s.marks);
  } else {
    subjects = getSubjects(parseInt(s.class) || parseInt(document.getElementById("class")?.value || 0), s.section);
  }

  buildMarksInputsForStudent(s);
  displayPercentage(s);
}

/* --------------------------
   Build marks input DOM for a student object
   -------------------------- */
function buildMarksInputsForStudent(s) {
  const marksInputs = document.getElementById("marksInputs");
  if (!marksInputs) return;
  marksInputs.innerHTML = "";
  const maxMarks = getMaxMarksPerSubject(currentExam);
  subjects.forEach((sub, i) => {
    const markVal = (s.marks && typeof s.marks[sub] !== "undefined") ? s.marks[sub] : 0;
    const statusVal = (s.status && s.status[sub]) ? s.status[sub] : "Present";
    const div = document.createElement("div");
    div.className = "subject-row";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.margin = "6px 0";
    div.innerHTML = `
      <label style="width:150px">${sub}:</label>
      <input data-sub="${sub}" type="number" id="mark-${i}" min="0" max="${maxMarks}" value="${markVal}" style="width:120px;padding:6px" />
      <select id="status-${i}" style="padding:6px">
        <option value="Present" ${statusVal === "Present" ? "selected" : ""}>Present</option>
        <option value="Absent" ${statusVal === "Absent" ? "selected" : ""}>Absent</option>
      </select>
    `;
    marksInputs.appendChild(div);
  });

  // attach keyboard navigation and autosave handlers on numeric inputs
  attachMarkInputHandlers();
}

/* --------------------------
   Attach keyboard navigation & autosave to mark inputs
   -------------------------- */
function attachMarkInputHandlers() {
  const inputs = Array.from(document.querySelectorAll('#marksInputs input[type="number"]'));
  inputs.forEach((inp, idx) => {
    inp.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        // Save current (if autosave enabled)
        if (autoSaveEnabled) {
          triggerSaveMarksSilently();
        }
        // go next or wrap to first
        const nextIndex = (idx + 1) < inputs.length ? (idx + 1) : 0;
        inputs[nextIndex].focus();
        inputs[nextIndex].select();
      } else if (e.key === "Tab") {
        // default behavior - do nothing
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (idx + 1) < inputs.length ? (idx + 1) : idx;
        inputs[nextIndex].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (idx - 1) >= 0 ? (idx - 1) : idx;
        inputs[prevIndex].focus();
      }
    };

    // autosave on change if enabled
    inp.oninput = function () {
      if (autoSaveEnabled) triggerSaveMarksSilently();
    };

    // also save if teacher changes status select
    const statusSel = inp.parentElement.querySelector('select');
    if (statusSel) {
      statusSel.onchange = function () {
        if (autoSaveEnabled) triggerSaveMarksSilently();
      };
    }
  });
}

/* --------------------------
   display percentage in form
   -------------------------- */
function displayPercentage(s) {
  const pd = document.getElementById("percentageDisplay");
  if (!pd) return;
  pd.textContent = `Percentage: ${parseFloat(s.percentage || 0).toFixed(2)}%`;
}

/* --------------------------
   Save marks from form into students[selectedStudentIndex]
   - used by Save button
   -------------------------- */
function saveMarks() {
  if (selectedStudentIndex === null || selectedStudentIndex === undefined) {
    alert("Select a student to save marks.");
    return;
  }
  const s = students[selectedStudentIndex];
  const nameEl = document.getElementById("name");
  const classEl = document.getElementById("class");
  const sectionEl = document.getElementById("section");
  s.name = nameEl ? nameEl.value.trim() : s.name;
  s.class = classEl ? classEl.value : s.class;
  s.section = sectionEl ? sectionEl.value : s.section;

  if (!s.name) { alert("Student name is required."); return; }
  if (!s.class || !s.section) { alert("Please select class and section."); return; }

  // ensure subjects are up-to-date
  subjects = getSubjects(parseInt(s.class), s.section);
  const maxMarks = getMaxMarksPerSubject(currentExam);

  s.marks = s.marks || {};
  s.status = s.status || {};

  // read each input
  subjects.forEach((sub, i) => {
    const markEl = document.getElementById(`mark-${i}`);
    const statusEl = document.getElementById(`status-${i}`);
    let mark = markEl ? Number(markEl.value || 0) : 0;
    const status = statusEl ? statusEl.value : "Present";
    if (status === "Absent") mark = 0;
    if (mark > maxMarks) {
      alert(`Mark for ${sub} cannot exceed ${maxMarks}`);
      throw new Error(`Mark for ${sub} exceeds max`);
    }
    s.marks[sub] = mark;
    s.status[sub] = status;
  });

  // totals & percentage
  const arr = Object.keys(s.marks).map(k => Number(s.marks[k] || 0));
  s.total = arr.reduce((a,b) => a + b, 0);
  s.average = arr.length ? s.total / arr.length : 0;
  s.percentage = arr.length ? (s.total / (arr.length * maxMarks) * 100) : 0;

  saveToLocalStorage();
  renderStudentList();
  displayPercentage(s);
  return true;
}

/* wrapper save that avoids alert on error used by autosave */
function triggerSaveMarksSilently() {
  try {
    saveMarks();
  } catch (e) {
    console.warn("Autosave: saveMarks failed:", e);
  }
}

/* --------------------------
   Save & Next button behavior
   - saves current student, moves to next student in array and loads it
   -------------------------- */
function saveAndNext() {
  if (selectedStudentIndex === null || selectedStudentIndex === undefined) {
    alert("Select a student first.");
    return;
  }
  const ok = saveMarks();
  if (!ok) return; // if save failed or validation
  const nextIndex = (selectedStudentIndex + 1) < students.length ? selectedStudentIndex + 1 : 0;
  loadStudent(nextIndex);
}

/* --------------------------
   updateSectionOptions (fills #section)
   -------------------------- */
function updateSectionOptions() {
  const classSelect = document.getElementById("class");
  const sectionSelect = document.getElementById("section");
  if (!classSelect || !sectionSelect) return;
  const selectedClass = parseInt(classSelect.value);
  let sections = [];
  if (selectedClass >= 11) sections = ["A1","A2","A3","B1","B2","B3","C"];
  else if (selectedClass >=1 && selectedClass <= 10) sections = ["A","B","C","D"];
  else sections = [];
  sectionSelect.innerHTML = `<option value="">Select Section</option>`;
  sections.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec; opt.textContent = sec;
    sectionSelect.appendChild(opt);
  });
  sectionSelect.onchange = updateSubjectFields;
}

/* --------------------------
   updateSubjectFields: build marks inputs when class+section selected in form
   -------------------------- */
function updateSubjectFields() {
  const classVal = parseInt(document.getElementById("class")?.value || 0);
  const sectionVal = document.getElementById("section")?.value || "";
  const marksInputs = document.getElementById("marksInputs");
  if (!marksInputs) return;
  if (!classVal || !sectionVal) {
    marksInputs.innerHTML = "";
    document.getElementById("percentageDisplay").textContent = "";
    return;
  }
  subjects = getSubjects(classVal, sectionVal);
  const maxMarks = getMaxMarksPerSubject(currentExam);
  marksInputs.innerHTML = "";
  subjects.forEach((sub,i) => {
    const div = document.createElement("div");
    div.className = "subject-row";
    div.style.display = "flex"; div.style.gap = "8px"; div.style.margin = "6px 0";
    div.innerHTML = `
      <label style="width:150px">${sub}:</label>
      <input type="number" id="mark-${i}" min="0" max="${maxMarks}" value="0" style="width:120px;padding:6px" />
      <select id="status-${i}" style="padding:6px">
        <option value="Present">Present</option>
        <option value="Absent">Absent</option>
      </select>
    `;
    marksInputs.appendChild(div);
  });
  attachMarkInputHandlers();
}

/* --------------------------
   clearForm
   -------------------------- */
function clearForm() {
  selectedStudentIndex = null;
  const nameEl = document.getElementById("name");
  const classEl = document.getElementById("class");
  const sectionEl = document.getElementById("section");
  if (nameEl) nameEl.value = "";
  if (classEl) classEl.value = "";
  if (sectionEl) sectionEl.innerHTML = `<option value="">Select Section</option>`;
  const marksInputs = document.getElementById("marksInputs");
  if (marksInputs) marksInputs.innerHTML = "";
  const pd = document.getElementById("percentageDisplay");
  if (pd) pd.textContent = "";
}

/* --------------------------
   Export CSV
   -------------------------- */
function downloadExcel() {
  if (!currentExam || !students || students.length === 0) { alert("No data to export."); return; }
  // derive subjects: union of all marks keys or from subjects global
  let colSubjects = subjects.length ? subjects.slice() : [];
  if (colSubjects.length === 0) {
    const s0 = students[0];
    colSubjects = s0 && s0.marks ? Object.keys(s0.marks) : [];
  }
  const header = ["No","Name","Class","Section", ...colSubjects.flatMap(s=>[`${s} Mark`, `${s} Status`]), "Total","Average","Percentage"];
  const rows = [header.join(",")];
  students.forEach((st, i) => {
    const row = [i+1, `"${st.name.replace(/"/g,""" )}"` || `""`, st.class || "", st.section || ""];
    colSubjects.forEach(sub => {
      const m = (st.marks && typeof st.marks[sub] !== "undefined") ? st.marks[sub] : "";
      const stt = (st.status && st.status[sub]) ? st.status[sub] : "Present";
      row.push(m);
      row.push(stt);
    });
    row.push(st.total || 0);
    row.push(((st.average||0)).toFixed(2));
    row.push(((st.percentage||0)).toFixed(2));
    rows.push(row.join(","));
  });
  const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
  const link = document.createElement("a");
  link.href = encodeURI(csvContent);
  link.download = `${currentExam}_marks.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* --------------------------
   Print / PDF by opening new window and calling print()
   -------------------------- */
function downloadPDF() {
  if (!currentExam || !students || students.length === 0) { alert("No data to export."); return; }
  // build HTML
  const win = window.open("", "_blank", "width=1000,height=800");
  const colSubs = subjects.length ? subjects.slice() : (students[0] && students[0].marks ? Object.keys(students[0].marks) : []);
  let html = `<html><head><title>${currentExam} - Marks</title><style>body{font-family:Arial;color:#000;padding:20px;}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:6px;text-align:center}th{background:#eee}</style></head><body>`;
  html += `<h2>VMHSS MLP - ${currentExam} Student Mark List</h2>`;
  html += "<table><thead><tr><th>No</th><th>Name</th><th>Class</th><th>Section</th>";
  colSubs.forEach(s => html += `<th>${s}</th><th>${s} Status</th>`);
  html += "<th>Total</th><th>Avg</th><th>%</th></tr></thead><tbody>";
  students.forEach((st, i) => {
    html += `<tr><td>${i+1}</td><td>${st.name}</td><td>${st.class||""}</td><td>${st.section||""}</td>`;
    colSubs.forEach(s => {
      html += `<td>${(st.marks && typeof st.marks[s] !== "undefined")?st.marks[s]:""}</td><td>${(st.status && st.status[s])?st.status[s]:""}</td>`;
    });
    html += `<td>${st.total||0}</td><td>${(st.average||0).toFixed(2)}</td><td>${(st.percentage||0).toFixed(2)}%</td></tr>`;
  });
  html += "</tbody></table></body></html>";
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

/* wrapper for print button */
function printFullMarkList() { downloadPDF(); }

/* --------------------------
   Bulk Entry functions
   -------------------------- */
function toggleBulkMode() {
  const bulkWrap = document.getElementById("bulkEntry");
  if (!bulkWrap) return;
  bulkMode = !bulkMode;
  bulkWrap.style.display = bulkMode ? "block" : "none";
  const btn = document.getElementById("toggleBulkBtn") || document.getElementById("toggleBulkBtn2");
  if (btn) btn.textContent = bulkMode ? "Exit Bulk" : "Bulk Entry";
  if (bulkMode) buildBulkTable();
}

/* build bulk-table */
function buildBulkTable() {
  const bulkTable = document.getElementById("bulkTable");
  if (!bulkTable) return;
  bulkTable.innerHTML = "";

  // derive subjects union
  let colSubjects = subjects.length ? subjects.slice() : [];
  if (colSubjects.length === 0 && students.length) {
    const union = new Set();
    students.forEach(s => { if (s.marks) Object.keys(s.marks).forEach(k=>union.add(k)); });
    colSubjects = Array.from(union);
  }

  // header
  const thead = document.createElement("thead");
  let headerHtml = `<tr><th>#</th><th>Name</th>`;
  colSubjects.forEach(s => headerHtml += `<th>${s}</th>`);
  headerHtml += `<th>Total</th><th>%</th></tr>`;
  thead.innerHTML = headerHtml;
  bulkTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  const maxMarks = getMaxMarksPerSubject(currentExam);

  students.forEach((st, idx) => {
    let row = document.createElement("tr");
    let cells = `<td>${idx+1}</td><td>${st.name}</td>`;
    colSubjects.forEach(sub => {
      const val = (st.marks && typeof st.marks[sub] !== "undefined") ? st.marks[sub] : 0;
      cells += `<td><input class="bulk-mark" data-idx="${idx}" data-sub="${sub}" type="number" min="0" max="${maxMarks}" value="${val}" /></td>`;
    });
    const tot = colSubjects.reduce((a,s) => a + Number(st.marks && st.marks[s] ? st.marks[s] : 0), 0);
    const perc = colSubjects.length ? (tot / (colSubjects.length * maxMarks) * 100) : 0;
    cells += `<td class="bulk-total">${tot}</td><td class="bulk-perc">${perc.toFixed(2)}%</td>`;
    row.innerHTML = cells;
    tbody.appendChild(row);
  });

  bulkTable.appendChild(tbody);

  // attach listeners to inputs
  const inputs = bulkTable.querySelectorAll(".bulk-mark");
  inputs.forEach(inp => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const sub = e.target.dataset.sub;
      const val = Number(e.target.value || 0);
      if (!students[idx].marks) students[idx].marks = {};
      students[idx].marks[sub] = val;
      // update totals
      const total = colSubjects.reduce((a,s) => a + Number(students[idx].marks[s] || 0), 0);
      const perc = colSubjects.length ? (total / (colSubjects.length * maxMarks) * 100) : 0;
      const row = e.target.closest("tr");
      row.querySelector(".bulk-total").textContent = total;
      row.querySelector(".bulk-perc").textContent = perc.toFixed(2) + "%";
      if (autoSaveEnabled) saveToLocalStorage();
    });
  });
}

/* Save bulk changes to students[] and recalc totals */
function saveBulkChanges() {
  if (!students.length) { alert("No students loaded."); return; }
  const maxMarks = getMaxMarksPerSubject(currentExam);
  // derive col subjects
  let colSubjects = subjects.length ? subjects : [];
  if (!colSubjects.length && students.length) {
    const union = new Set();
    students.forEach(s => { if (s.marks) Object.keys(s.marks).forEach(k=>union.add(k)); });
    colSubjects = Array.from(union);
  }
  students.forEach(st => {
    if (!st.marks) st.marks = {};
    const total = colSubjects.reduce((a,s) => a + Number(st.marks[s] || 0), 0);
    st.total = total;
    st.average = colSubjects.length ? total / colSubjects.length : 0;
    st.percentage = colSubjects.length ? (total / (colSubjects.length * maxMarks) * 100) : 0;
  });
  saveToLocalStorage();
  renderStudentList();
  alert("Bulk changes saved.");
}

/* Quick fill: fill empty marks with a provided value (default 0) */
function applyQuickFill() {
  if (!students.length) { alert("No students loaded."); return; }
  const v = prompt("Fill empty marks with value (leave empty for 0):", "0");
  if (v === null) return;
  const fill = v.trim() === "" ? 0 : Number(v);
  students.forEach(s => {
    if (!s.marks) s.marks = {};
    const keys = subjects.length ? subjects : Object.keys(s.marks);
    keys.forEach(k => {
      if (typeof s.marks[k] === "undefined" || s.marks[k] === "") s.marks[k] = fill;
    });
  });
  saveToLocalStorage();
  buildBulkTable();
  renderStudentList();
}

/* --------------------------
   Copy names from previous exam into current exam
   - copy only name/class/section (marks cleared)
   -------------------------- */
function populateCopyExamSelect() {
  const sel = document.getElementById("copyExamSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">Copy students from...</option>`;
  // search localStorage keys for exam_ prefix or direct exam names
  const keys = [];
  for (let i=0;i<localStorage.length;i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("exam_")) {
      keys.push(k.replace(/^exam_/, ""));
    } else if (/^(cycleTest|midTerm|quarterly|halfYearly|annual)/i.test(k)) {
      keys.push(k);
    }
  }
  const unique = Array.from(new Set(keys)).sort();
  unique.forEach(name => {
    if (name === currentExam) return;
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

/* Copy names button click handler */
function copyNamesFromSelectedExam() {
  const sel = document.getElementById("copyExamSelect");
  if (!sel) return;
  const chosen = sel.value;
  if (!chosen) { alert("Select an exam to copy from."); return; }
  // load selected exam students
  const prev = loadFromLocalStorage(chosen);
  if (!prev || !prev.length) { alert("Selected exam has no students."); return; }
  if (!confirm(`Copy ${prev.length} students from ${chosen} into ${currentExam}? Existing students will not be removed.`)) return;

  // append copied students but clear marks
  prev.forEach(p => {
    const copy = {
      name: p.name || "",
      class: p.class || "",
      section: p.section || "",
      marks: {}, // empty marks for new exam
      status: {},
      total: 0,
      average: 0,
      percentage: 0
    };
    students.push(copy);
  });

  saveToLocalStorage();
  renderStudentList();
  alert("Students copied. You can now enter marks.");
}

/* Also offer a convenience function to copy previous exam automatically (used by some buttons) */
function copyPreviousExam() {
  // pick the latest exam key by scanning storage for most recently saved exam_* key (best-effort)
  const examKeys = [];
  for (let i=0;i<localStorage.length;i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("exam_") && k !== examStorageKey(currentExam)) examKeys.push(k);
  }
  if (!examKeys.length) { alert("No previous exam data found in storage."); return; }
  // choose the last key in the array (not strictly chronological but acceptable)
  const chosenKey = examKeys[examKeys.length - 1];
  const chosenExam = chosenKey.replace(/^exam_/, "");
  if (!confirm(`Copy students from ${chosenExam}?`)) return;
  const prev = loadFromLocalStorage(chosenExam);
  if (!prev || !prev.length) { alert("No students found in selected exam."); return; }
  prev.forEach(p => {
    students.push({
      name: p.name || "",
      class: p.class || "",
      section: p.section || "",
      marks: {},
      status: {},
      total: 0,
      average: 0,
      percentage: 0
    });
  });
  saveToLocalStorage();
  renderStudentList();
  alert("Previous exam names copied.");
}

/* --------------------------
   Mark all present
   -------------------------- */
function markAllPresent() {
  if (!students.length) { alert("No students loaded."); return; }
  students.forEach(st => {
    st.status = st.status || {};
    const keys = subjects.length ? subjects.slice() : Object.keys(st.marks || {});
    keys.forEach(k => st.status[k] = "Present");
  });
  saveToLocalStorage();
  renderStudentList();
  alert("Marked Present for all students.");
}

/* --------------------------
   Toggle absent/present for the currently loaded student
   - If no student selected, toggles nothing
   -------------------------- */
function markAbsentToggle() {
  if (selectedStudentIndex === null || selectedStudentIndex === undefined) { alert("Select a student first."); return; }
  const s = students[selectedStudentIndex];
  if (!s) return;
  s.status = s.status || {};
  subjects.forEach((sub, i) => {
    s.status[sub] = (s.status[sub] === "Absent") ? "Present" : "Absent";
    if (s.status[sub] === "Absent") s.marks[sub] = 0;
  });
  saveToLocalStorage();
  buildMarksInputsForStudent(s); // rebuild to reflect statuses
  renderStudentList();
}

/* --------------------------
   Backup / Import
   -------------------------- */
function downloadBackup() {
  if (!currentExam) { alert("Select an exam first."); return; }
  const data = { exam: currentExam, timestamp: new Date().toISOString(), students };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentExam}_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* open file dialog */
function openImportDialog() {
  const input = document.getElementById("importFile");
  if (!input) return;
  input.click();
}

/* handle import file change */
function handleImportFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  if (file.name.endsWith(".json")) {
    reader.onload = function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !parsed.students) { alert("JSON format not recognized (expected {exam, timestamp, students})."); return; }
        // if parsed.exam differs from currentExam, ask user
        if (parsed.exam && parsed.exam !== currentExam) {
          const ok = confirm(`Imported file is for ${parsed.exam}. Load into current exam "${currentExam}"?`);
          if (!ok) return;
        }
        // replace current students
        students = parsed.students.map(s => {
          // ensure shape correctness
          return {
            name: s.name || "",
            class: s.class || "",
            section: s.section || "",
            marks: s.marks || {},
            status: s.status || {},
            total: s.total || 0,
            average: s.average || 0,
            percentage: s.percentage || 0
          };
        });
        saveToLocalStorage();
        renderStudentList();
        alert("Import successful.");
      } catch (err) {
        console.error(err);
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith(".csv")) {
    reader.onload = function(e) {
      const text = e.target.result;
      try {
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== "");
        const header = rows.shift().split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        // attempt to parse simply: Name,Class,Section, subj mark columns...
        const nameIdx = header.findIndex(h => /name/i.test(h));
        const classIdx = header.findIndex(h => /class/i.test(h));
        const sectionIdx = header.findIndex(h => /section/i.test(h));
        // subject columns are columns after the first 3 that are not Total/Average/Percentage
        const subjectCols = header
          .map((h,i) => ({h,i}))
          .filter(x => !/name|class|section|total|average|percentage/i.test(x.h));
        const imported = [];
        rows.forEach(line => {
          const cols = line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
          const nm = nameIdx >= 0 ? cols[nameIdx] : `Row${imported.length+1}`;
          const cls = classIdx >= 0 ? cols[classIdx] : "";
          const sec = sectionIdx >= 0 ? cols[sectionIdx] : "";
          const marks = {};
          subjectCols.forEach(col => {
            const key = header[col.i];
            marks[key] = Number(cols[col.i] || 0);
          });
          imported.push({ name: nm, class: cls, section: sec, marks, status: {}, total: 0, average: 0, percentage: 0 });
        });
        if (!imported.length) { alert("No rows parsed from CSV."); return; }
        // append
        students = students.concat(imported);
        saveToLocalStorage();
        renderStudentList();
        alert("CSV imported (best-effort).");
      } catch (err) {
        console.error("CSV import failed:", err);
        alert("CSV import failed.");
      }
    };
    reader.readAsText(file);
  } else {
    alert("Unsupported file type. Use .json or .csv.");
  }
  // reset input value to allow re-import of same file
  ev.target.value = "";
}

/* --------------------------
   AutoSave toggle
   -------------------------- */
function autoSaveToggle() {
  autoSaveEnabled = !autoSaveEnabled;
  const btn = document.getElementById("autoSaveBtn");
  if (btn) btn.textContent = `Auto Save: ${autoSaveEnabled ? "On" : "Off"}`;
  if (autoSaveEnabled) saveToLocalStorage();
}

/* --------------------------
   Delete all students for current exam
   -------------------------- */
function deleteAllStudents() {
  if (!currentExam) { alert("Select an exam first."); return; }
  if (!confirm(`Delete ALL students for ${currentExam}? This cannot be undone.`)) return;
  students = [];
  saveToLocalStorage();
  renderStudentList();
  clearForm();
}

/* --------------------------
   Search / filter left list
   -------------------------- */
function filterStudentList() {
  const q = (document.getElementById("searchBox")?.value || "").toLowerCase();
  const listEl = document.getElementById("list");
  if (!listEl) return;
  Array.from(listEl.children).forEach(li => {
    const txt = li.textContent.toLowerCase();
    li.style.display = q ? (txt.includes(q) ? "" : "none") : "";
  });
}

/* --------------------------
   Dark mode
   -------------------------- */
function toggleDarkMode() {
  const body = document.body;
  body.classList.toggle("dark-mode");
  localStorage.setItem("mlp_dark_mode", body.classList.contains("dark-mode"));
}
function loadDarkModePref() {
  if (localStorage.getItem("mlp_dark_mode") === "true") document.body.classList.add("dark-mode");
}

/* --------------------------
   Exam comparison selects & chart
   -------------------------- */
function populateCompareExamSelects() {
  const selA = document.getElementById("compareExamA");
  const selB = document.getElementById("compareExamB");
  if (!selA || !selB) return;
  selA.innerHTML = `<option value="">Select Exam A</option>`;
  selB.innerHTML = `<option value="">Select Exam B</option>`;
  // list exam keys from localStorage
  const keys = [];
  for (let i=0;i<localStorage.length;i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("exam_")) keys.push(k.replace(/^exam_/, ""));
  }
  const unique = Array.from(new Set(keys)).sort();
  unique.forEach(e => {
    const o1 = document.createElement("option"); o1.value = e; o1.textContent = e; selA.appendChild(o1);
    const o2 = document.createElement("option"); o2.value = e; o2.textContent = e; selB.appendChild(o2);
  });
}

/* generateComparison: compute totals for both exams and draw chart */
function generateComparison() {
  const a = document.getElementById("compareExamA")?.value;
  const b = document.getElementById("compareExamB")?.value;
  if (!a || !b) { alert("Select both exams to compare."); return; }
  const da = loadFromLocalStorage(a);
  const db = loadFromLocalStorage(b);
  if (!da.length || !db.length) { alert("One of the selected exams has no data."); return; }

  // build union of student names
  const names = Array.from(new Set([...da.map(x=>x.name), ...db.map(x=>x.name)]));
  const dataA = names.map(n => { const s = da.find(x=>x.name===n); return s ? (Number(s.total)||0) : 0; });
  const dataB = names.map(n => { const s = db.find(x=>x.name===n); return s ? (Number(s.total)||0) : 0; });

  drawComparisonChart(names, dataA, dataB);
}

/* drawComparisonChart: simple canvas drawing */
function drawComparisonChart(labels, dataA, dataB) {
  const canvas = document.getElementById("comparisonChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // simple grouped bar chart, scale by max
  const W = canvas.width;
  const H = canvas.height;
  const N = labels.length;
  const maxVal = Math.max(...dataA, ...dataB, 10);
  const padding = 40;
  const availW = W - padding*2;
  const barGroupWidth = Math.max(12, Math.floor(availW / Math.max(1, N)));
  const barWidth = Math.floor(barGroupWidth / 3);

  // axes
  ctx.fillStyle = "#222"; ctx.font = "12px Arial";
  ctx.fillText("Totals", 8, 12);

  labels.forEach((lab, i) => {
    const xBase = padding + i * barGroupWidth;
    const aH = (dataA[i] / maxVal) * (H - padding*2);
    const bH = (dataB[i] / maxVal) * (H - padding*2);
    // A bar - blue
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(xBase, H - padding - aH, barWidth, aH);
    // B bar - orange
    ctx.fillStyle = "#f97316";
    ctx.fillRect(xBase + barWidth + 4, H - padding - bH, barWidth, bH);
    // label
    ctx.fillStyle = "#000"; ctx.font = "10px Arial";
    const labelText = lab.length > 10 ? lab.slice(0,10) + "…" : lab;
    ctx.fillText(labelText, xBase, H - padding + 12);
  });

  // legend
  ctx.fillStyle = "#3b82f6"; ctx.fillRect(W - 160, 10, 12, 12); ctx.fillStyle="#000"; ctx.fillText("Exam A", W - 140, 20);
  ctx.fillStyle = "#f97316"; ctx.fillRect(W - 160, 30, 12, 12); ctx.fillStyle="#000"; ctx.fillText("Exam B", W - 140, 40);
}

/* --------------------------
   Utility: export class summary PDF/print
   -------------------------- */
function exportClassSummaryPDF() {
  if (!students.length) { alert("No data available."); return; }
  const avg = (students.reduce((a,s)=>a + (s.total||0), 0) / students.length).toFixed(2);
  const topper = students.slice().sort((a,b)=> (b.total||0) - (a.total||0))[0] || {};
  const passCount = students.reduce((a,s)=> a + ((s.percentage||0) >= 35 ? 1 : 0), 0); // pass threshold 35
  const passRate = ((passCount / students.length) * 100).toFixed(2);
  const win = window.open("", "_blank", "width=800,height=600");
  const html = `<html><head><title>Class Summary</title><style>body{font-family:Arial;color:#000;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:8px}</style></head><body>
    <h2>Class Summary - ${currentExam}</h2>
    <p><strong>Topper:</strong> ${topper.name || "N/A"} (${topper.total || 0})</p>
    <p><strong>Average Marks:</strong> ${avg}</p>
    <p><strong>Pass Rate:</strong> ${passRate}%</p>
    <button onclick="window.print()">Print</button>
  </body></html>`;
  win.document.write(html);
  win.document.close();
}

/* --------------------------
   Initialization wiring
   -------------------------- */
function init() {
  // load dark mode
  loadDarkModePref();

  // wire up exam select
  const examSel = document.getElementById("examSelect");
  if (examSel) examSel.onchange = changeExam;

  // populate copyExamSelect
  populateCopyExamSelect();

  // copy names button
  const copyBtn = document.getElementById("copyNamesBtn");
  if (copyBtn) copyBtn.onclick = copyNamesFromSelectedExam;

  // main control buttons
  document.getElementById("addStudentBtn")?.addEventListener("click", addStudent);
  document.getElementById("delAllBtn")?.addEventListener("click", deleteAllStudents);
  document.getElementById("openImportBtn")?.addEventListener("click", openImportDialog); // optional
  document.getElementById("openImportDialog")?.addEventListener("click", openImportDialog);
  document.getElementById("toggleBulkBtn")?.addEventListener("click", toggleBulkMode);
  document.getElementById("toggleBulkBtn2")?.addEventListener("click", toggleBulkMode);
  document.getElementById("copyPrevBtn")?.addEventListener("click", copyPreviousExam);
  document.getElementById("copyPrevBtn2")?.addEventListener("click", copyPreviousExam);
  document.getElementById("markAllPresentBtn")?.addEventListener("click", markAllPresent);
  document.getElementById("markAllPresentBtn2")?.addEventListener("click", markAllPresent);
  document.getElementById("applyQuickFillBtn")?.addEventListener("click", applyQuickFill);
  document.getElementById("quickFillBtn")?.addEventListener("click", applyQuickFill);
  document.getElementById("quickFillBtn2")?.addEventListener("click", applyQuickFill);

  document.getElementById("saveBtn")?.addEventListener("click", () => {
    try { saveMarks(); } catch(e) { console.error(e); }
  });

  document.getElementById("saveNextBtn")?.addEventListener("click", saveAndNext);
  document.getElementById("saveNextBtn")?.onclick = saveAndNext;

  document.getElementById("autoSaveBtn")?.addEventListener("click", autoSaveToggle);
  document.getElementById("backupBtn")?.addEventListener("click", downloadBackup);
  document.getElementById("importFile")?.addEventListener("change", handleImportFile);
  document.getElementById("exportCSVBtn")?.addEventListener("click", downloadExcel);
  document.getElementById("classSummaryBtn")?.addEventListener("click", exportClassSummaryPDF);

  // search input
  document.getElementById("searchBox")?.addEventListener("input", filterStudentList);

  // dark mode toggle
  const darkToggle = document.getElementById("darkModeToggle");
  if (darkToggle) darkToggle.addEventListener("change", toggleDarkMode);

  // copy previous exam button (top)
  document.getElementById("copyPrevBtn")?.addEventListener("click", copyPreviousExam);

  // compare exam controls
  populateCompareExamSelects();
  document.getElementById("compareExamA")?.addEventListener("change", () => {});
  document.getElementById("compareExamB")?.addEventListener("change", () => {});
  document.getElementById("generateComparison")?.addEventListener("click", generateComparison);

  // initial exam load if examSelect has a value
  if (examSel && examSel.value) {
    changeExam();
  } else {
    // try to load first exam found in localStorage
    for (let i=0;i<localStorage.length;i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("exam_")) {
        const nm = k.replace(/^exam_/, '');
        const sel = document.getElementById("examSelect");
        if (sel) {
          // try to find an option with that value and set it
          const opt = Array.from(sel.options).find(o => o.value === nm);
          if (opt) {
            sel.value = nm;
            changeExam();
            break;
          }
        }
      }
    }
  }

  // global keyboard handler for Enter navigation across marks in bulk as well
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const active = document.activeElement;
      // if inside marksInputs number input
      if (active && active.tagName === "INPUT" && active.type === "number" && active.closest("#marksInputs")) {
        e.preventDefault();
        const inputs = Array.from(document.querySelectorAll('#marksInputs input[type="number"]'));
        const index = inputs.indexOf(active);
        if (index >= 0) {
          const next = (index + 1) < inputs.length ? (index + 1) : 0;
          inputs[next].focus();
          inputs[next].select();
        }
      }
      // if inside bulk table input
      if (active && active.tagName === "INPUT" && active.type === "number" && active.closest("#bulkTable")) {
        e.preventDefault();
        const inputs = Array.from(document.querySelectorAll('#bulkTable input.bulk-mark'));
        const index = inputs.indexOf(active);
        if (index >= 0) {
          const next = (index + 1) < inputs.length ? (index + 1) : 0;
          inputs[next].focus();
          inputs[next].select();
        }
      }
    } else if (e.key === "Escape") {
      // allow ESC to close bulk mode
      if (bulkMode) toggleBulkMode();
    }
  });

  // expose functions for inline onclick compatibility
  window.changeExam = changeExam;
  window.populateSubExamNumbers = populateSubExamNumbers;
  window.loadStudentsForSelectedExam = function () { students = loadFromLocalStorage(currentExam); renderStudentList(); };
  window.addStudent = addStudent;
  window.deleteStudent = deleteStudent;
  window.renderStudentList = renderStudentList;
  window.loadStudent = loadStudent;
  window.saveMarks = saveMarks;
  window.updateSectionOptions = updateSectionOptions;
  window.updateSubjectFields = updateSubjectFields;
  window.saveToLocalStorage = saveToLocalStorage;
  window.downloadExcel = downloadExcel;
  window.downloadPDF = downloadPDF;
  window.printFullMarkList = printFullMarkList;
  window.toggleBulkMode = toggleBulkMode;
  window.buildBulkTable = buildBulkTable;
  window.saveBulkChanges = saveBulkChanges;
  window.applyQuickFill = applyQuickFill;
  window.copyPreviousExam = copyPreviousExam;
  window.copyNamesFromSelectedExam = copyNamesFromSelectedExam;
  window.copyNamesBtn = copyNamesFromSelectedExam;
  window.copyPreviousExam = copyPreviousExam;
  window.markAllPresent = markAllPresent;
  window.downloadBackup = downloadBackup;
  window.openImportDialog = openImportDialog;
  window.handleImportFile = handleImportFile;
  window.deleteAllStudents = deleteAllStudents;
  window.autoSaveToggle = autoSaveToggle;
  window.filterStudentList = filterStudentList;
  window.toggleDarkMode = toggleDarkMode;
  window.populateCompareExamSelects = populateCompareExamSelects;
  window.generateComparison = generateComparison;
  window.saveAndNext = saveAndNext;
  window.markAbsentToggle = markAbsentToggle;
}

/* run init once DOM is ready */
document.addEventListener("DOMContentLoaded", init);
