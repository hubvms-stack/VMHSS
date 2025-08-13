let students = [];
let selectedStudentIndex = null;
let subjects = [];
let currentExam = ""; // e.g. "cycleTest1", "midTerm2", "quarterly"

function getSubjects(classValue, sectionValue) {
  if (classValue >= 1 && classValue <= 10) {
    return ["Tamil", "English", "Maths", "Science", "Social Science"];
  }
  if (classValue >= 11) {
    if (["A1", "A2"].includes(sectionValue)) {
      return ["Tamil", "English", "Maths", "Physics", "Chemistry", "Biology"];
    } else if (sectionValue === "A3") {
      return ["Tamil", "English", "Physics", "Chemistry", "Biology", "Computer Science"];
    } else if (["B1", "B2", "B3"].includes(sectionValue)) {
      return ["Tamil", "English", "Maths", "Physics", "Chemistry", "Computer Science"];
    } else if (sectionValue === "C") {
      return ["Tamil", "English", "Economics", "Accountancy", "Commerce", "Computer Application"];
    }
  }
  return [];
}

function getMaxMarksPerSubject(exam) {
  if (!exam) return 100; // default max
  if (exam.startsWith("cycleTest")) return 30;
  if (exam.startsWith("midTerm")) return 50;
  if (["quarterly", "halfYearly", "annual"].includes(exam)) return 100;
  return 100;
}

// Load students for selected exam from localStorage
function loadStudentsForSelectedExam() {
  const saved = localStorage.getItem(currentExam);
  students = saved ? JSON.parse(saved) : [];
  selectedStudentIndex = null;
  renderStudentList();
  clearForm();
}

function changeExam() {
  const examSelect = document.getElementById("examSelect");
  currentExam = examSelect.value;

  const subExamNumberDiv = document.getElementById("subExamNumberDiv");
  const subExamNumberSelect = document.getElementById("subExamNumber");

  if (currentExam === "cycleTest") {
    subExamNumberDiv.style.display = "block";
    populateSubExamNumbers(10, "cycleTest"); // 1 to 10
  } else if (currentExam === "midTerm") {
    subExamNumberDiv.style.display = "block";
    populateSubExamNumbers(3, "midTerm"); // 1 to 3
  } else {
    subExamNumberDiv.style.display = "none";
    currentExam = examSelect.value; // quarterly, halfYearly, annual
    loadStudentsForSelectedExam();
  }
}

function populateSubExamNumbers(maxNum, prefix) {
  const subExamNumberSelect = document.getElementById("subExamNumber");
  subExamNumberSelect.innerHTML = `<option value="">Select Test Number</option>`;
  for (let i = 1; i <= maxNum; i++) {
    const option = document.createElement("option");
    option.value = prefix + i;
    option.textContent = prefix === "cycleTest" ? `Cycle Test ${i}` : `Mid Term ${i}`;
    subExamNumberSelect.appendChild(option);
  }
  subExamNumberSelect.onchange = () => {
    currentExam = subExamNumberSelect.value;
    loadStudentsForSelectedExam();
  };
}

function addStudent() {
  if (!currentExam) {
    alert("Please select an exam first.");
    return;
  }
  const newStudent = {
    name: "Student " + (students.length + 1),
    class: "",
    section: "",
    marks: [],
    status: [],
    total: 0,
    average: 0,
    percentage: 0
  };
  students.push(newStudent);
  saveToLocalStorage();
  renderStudentList();
  loadStudent(students.length - 1);
}

function deleteStudent(index) {
  if (confirm("Are you sure you want to delete this student?")) {
    students.splice(index, 1);
    saveToLocalStorage();
    renderStudentList();
    clearForm();
  }
}

function renderStudentList() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  if (students.length === 0) {
    document.getElementById("summaryInfo").innerHTML = "";
    return;
  }

  const sortedStudents = [...students].sort((a, b) => b.total - a.total);

  sortedStudents.forEach((student, index) => {
    const li = document.createElement("li");
    li.className = "student";
    li.innerHTML = `
      <span>${index + 1}. ${student.name}</span>
      <span>Total: ${student.total}</span>
      <button onclick="loadStudent(${students.indexOf(student)})">Edit</button>
      <button onclick="deleteStudent(${students.indexOf(student)})">Delete</button>
    `;
    list.appendChild(li);
  });

  const topper = sortedStudents[0];
  const totalAll = students.reduce((sum, s) => sum + s.total, 0);
  const avg = totalAll / students.length;

  document.getElementById("summaryInfo").innerHTML = `
    🏆 Topper: ${topper.name} - ${topper.total} marks (${topper.percentage.toFixed(2)}%)<br>
    📊 Class Average: ${avg.toFixed(2)} marks
  `;
}

function loadStudent(index) {
  selectedStudentIndex = index;
  const student = students[index];

  document.getElementById("name").value = student.name;
  document.getElementById("class").value = student.class;
  updateSectionOptions();
  document.getElementById("section").value = student.section;

  subjects = getSubjects(parseInt(student.class), student.section);

  const marksInputsDiv = document.getElementById("marksInputs");
  marksInputsDiv.innerHTML = "";

  subjects.forEach((subject, i) => {
    const mark = student.marks[i] || 0;
    const status = student.status[i] || "Present";

    const subjectDiv = document.createElement("div");
    subjectDiv.innerHTML = `
      <label>${subject}:</label>
      <input type="number" min="0" max="${getMaxMarksPerSubject(currentExam)}" id="mark-${i}" value="${mark}" />
      <select id="status-${i}">
        <option value="Present" ${status === "Present" ? "selected" : ""}>Present</option>
        <option value="Absent" ${status === "Absent" ? "selected" : ""}>Absent</option>
      </select>
    `;
    marksInputsDiv.appendChild(subjectDiv);
  });

  document.getElementById("percentageDisplay").textContent =
    `Percentage: ${student.percentage.toFixed(2)}%`;
}

function saveMarks() {
  if (selectedStudentIndex === null) {
    alert("Select a student to save marks.");
    return;
  }
  const student = students[selectedStudentIndex];
  student.name = document.getElementById("name").value.trim();
  student.class = document.getElementById("class").value;
  student.section = document.getElementById("section").value;

  if (!student.name) {
    alert("Student name is required.");
    return;
  }
  if (!student.class || !student.section) {
    alert("Please select class and section.");
    return;
  }

  subjects = getSubjects(parseInt(student.class), student.section);
  const maxMarks = getMaxMarksPerSubject(currentExam);

  student.marks = [];
  student.status = [];

  for (let i = 0; i < subjects.length; i++) {
    let mark = parseFloat(document.getElementById(`mark-${i}`).value) || 0;
    const status = document.getElementById(`status-${i}`).value;

    if (status === "Absent") {
      mark = 0;
    } else if (mark > maxMarks) {
      alert(`Mark for ${subjects[i]} cannot exceed ${maxMarks}`);
      return;
    }

    student.marks[i] = mark;
    student.status[i] = status;
  }

  student.total = student.marks.reduce((a, b) => a + b, 0);
  student.average = student.total / subjects.length;
  student.percentage = (student.total / (subjects.length * maxMarks)) * 100;

  document.getElementById("percentageDisplay").textContent =
    `Percentage: ${student.percentage.toFixed(2)}%`;

  saveToLocalStorage();
  renderStudentList();
  alert("Marks saved successfully!");
}

function updateSectionOptions() {
  const classSelect = document.getElementById("class");
  const sectionSelect = document.getElementById("section");
  const selectedClass = parseInt(classSelect.value);

  let sections = [];
  if (selectedClass >= 11) {
    sections = ["A1", "A2", "A3", "B1", "B2", "B3", "C"];
  } else if (selectedClass >= 1 && selectedClass <= 10) {
    sections = ["A", "B", "C", "D"];
  }

  sectionSelect.innerHTML = `<option value="">Select Section</option>`;
  sections.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec;
    opt.textContent = sec;
    sectionSelect.appendChild(opt);
  });

  sectionSelect.onchange = updateSubjectFields;
}

function updateSubjectFields() {
  const classVal = parseInt(document.getElementById("class").value);
  const sectionVal = document.getElementById("section").value;
  if (!classVal || !sectionVal) {
    document.getElementById("marksInputs").innerHTML = "";
    document.getElementById("percentageDisplay").textContent = "";
    return;
  }

  subjects = getSubjects(classVal, sectionVal);
  const maxMarks = getMaxMarksPerSubject(currentExam);

  const marksInputsDiv = document.getElementById("marksInputs");
  marksInputsDiv.innerHTML = "";

  subjects.forEach((subject, i) => {
    const subjectDiv = document.createElement("div");
    subjectDiv.innerHTML = `
      <label>${subject}:</label>
      <input type="number" min="0" max="${maxMarks}" id="mark-${i}" value="0" />
      <select id="status-${i}">
        <option value="Present">Present</option>
        <option value="Absent">Absent</option>
      </select>
    `;
    marksInputsDiv.appendChild(subjectDiv);
  });

  document.getElementById("percentageDisplay").textContent = "";
}

function saveToLocalStorage() {
  if (!currentExam) return;
  localStorage.setItem(currentExam, JSON.stringify(students));
}

function loadFromLocalStorage() {
  if (!currentExam) return;
  const saved = localStorage.getItem(currentExam);
  students = saved ? JSON.parse(saved) : [];
  renderStudentList();
  clearForm();
}

function clearForm() {
  selectedStudentIndex = null;
  document.getElementById("name").value = "";
  document.getElementById("class").value = "";
  document.getElementById("section").innerHTML = `<option value="">Select Section</option>`;
  document.getElementById("marksInputs").innerHTML = "";
  document.getElementById("percentageDisplay").textContent = "";
}

function downloadExcel() {
  if (!currentExam || students.length === 0) {
    alert("No data to export.");
    return;
  }

  if (subjects.length === 0 && students.length > 0) {
    subjects = getSubjects(parseInt(students[0].class), students[0].section);
  }

  const maxMarks = getMaxMarksPerSubject(currentExam);

  let csvContent = "data:text/csv;charset=utf-8,";

  csvContent += `No,Name,Class,Section,${subjects.map(s => `${s} Mark,${s} Status`).join(",")},Total,Average,Percentage\n`;

  students.forEach((student, index) => {
    const row = [
      index + 1,
      student.name,
      student.class,
      student.section,
      ...student.marks.flatMap((m, i) => [m, student.status[i]]),
      student.total,
      student.average.toFixed(2),
      student.percentage.toFixed(2)
    ].join(",");
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${currentExam}_marks.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadPDF() {
  if (!currentExam || students.length === 0) {
    alert("No data to export.");
    return;
  }

  const win = window.open('', '', 'height=700,width=900');
  win.document.write('<html><head><title>Student Mark List</title></head><body>');
  win.document.write(`<h1>VMHSS MLP - ${currentExam} Student Mark List</h1>`);

  win.document.write('<table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;">');
  win.document.write('<tr><th>No</th><th>Name</th><th>Class</th><th>Section</th>' +
    subjects.map(s => `<th>${s} Mark</th><th>${s} Status</th>`).join('') +
    '<th>Total</th><th>Average</th><th>Percentage</th></tr>');

  students.forEach((s, i) => {
    win.document.write(`<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.class}</td><td>${s.section}</td>` +
      s.marks.map((m, j) => `<td>${m}</td><td>${s.status[j]}</td>`).join('') +
      `<td>${s.total}</td><td>${s.average.toFixed(2)}</td><td>${s.percentage.toFixed(2)}%</td></tr>`);
  });

  win.document.write('</table>');
  win.document.write('</body></html>');
  win.document.close();
  win.print();
}

function printFullMarkList() {
  if (students.length === 0) {
    alert("No students to print.");
    return;
  }

  const printWindow = window.open('', '', 'width=1000,height=800');
  const headers = subjects.length ? subjects : ["Subject 1"];

  let html = `
    <html>
    <head>
      <title>Student Mark List</title>
      <style>
        body { font-family: Arial, sans-serif; color: #000; padding: 20px; }
        h1 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #000; padding: 8px; text-align: center; font-size: 14px; }
        th { background-color: #f2f2f2; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <h1>VMHSS Student Mark List - ${currentExam}</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>`;

  headers.forEach(sub => {
    html += `<th>${sub}</th>`;
  });

  html += `<th>Total</th><th>Percentage</th></tr></thead><tbody>`;

  students.forEach(student => {
    html += `<tr><td>${student.name}</td>`;
    student.marks.forEach(mark => {
      html += `<td>${mark}</td>`;
    });
    html += `<td>${student.total}</td><td>${student.percentage.toFixed(2)}%</td></tr>`;
  });

  html += `</tbody></table></body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
