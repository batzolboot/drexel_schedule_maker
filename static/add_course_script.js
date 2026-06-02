let allCourses = [];
let cart = [];

// ------------------------
// Load JSON data
// ------------------------
fetch("http://127.0.0.1:5000/courses")
  .then(res => res.json())
  .then(data => {
    allCourses = data;
    console.log("✅ Loaded courses:", allCourses.length);
  })
  .catch(err => console.error("❌ Error loading JSON file:", err));

// ------------------------
// Helper functions
// ------------------------

function parseTimeRange(timeStr) {
    if (!timeStr || !timeStr.includes("-")) return null;

    function convert(t) {
        const [time, ampm] = t.trim().split(" ");
        let [h, m] = time.split(":").map(Number);

        if (ampm.toLowerCase() === "pm" && h !== 12) h += 12;
        if (ampm.toLowerCase() === "am" && h === 12) h = 0;

        return h + m / 60;
    }

    const [startStr, endStr] = timeStr.split("-");
    return {
        start: convert(startStr),
        end: convert(endStr)
    };
}

// ------------------------
// Utility
// ------------------------
function formatTime(hourFloat) {
    const h = Math.floor(hourFloat);
    const m = Math.round((hourFloat - h) * 60);
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return `${hh}:${mm}`;
}

// ------------------------
// DOM elements
// ------------------------
const searchInput = document.getElementById('search-box');
const resultsContainer = document.getElementById('search-results');
const cartList = document.getElementById('cart-list');
const finishBtn = document.getElementById('finish-btn');

// ------------------------
// Autocomplete search
// ------------------------
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    resultsContainer.innerHTML = '';

    if (!query) return;

    const matches = allCourses
        .filter(course => `${course.subject} ${course.course_number}`.toLowerCase().startsWith(query))
        .slice(0, 10);

    matches.forEach(course => {
        const div = document.createElement('div');
        div.classList.add('autocomplete-item');
        div.innerHTML = `
            <span>${course.subject} ${course.course_number} - ${course.course_title}</span>
            <button class="add-btn">Add</button>
        `;

        div.querySelector('.add-btn').addEventListener('click', () => addToCart(course));
        resultsContainer.appendChild(div);
    });
});

// ------------------------
// Cart handling
// ------------------------
function addToCart(course) {
    if (cart.some(c => c.subject === course.subject && c.course_number === course.course_number)) {
        alert("Course already in cart!");
        return;
    }

    cart.push(course);
    renderCart();
}

function renderCart() {
    cartList.innerHTML = '';
    cart.forEach((course, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            ${course.subject} ${course.course_number} - ${course.course_title}
            <button class="remove-btn">X</button>
        `;

        li.querySelector('.remove-btn').addEventListener('click', () => {
            cart.splice(index, 1);
            renderCart();
        });

        cartList.appendChild(li);
    });
    updateCartUI();
}

function updateCartUI() {
    const emptyMessage = document.getElementById('cart-empty-message');

    if (cart.length === 0) {
        finishBtn.disabled = true;
        emptyMessage.style.display = "block";
    } else {
        finishBtn.disabled = false;
        emptyMessage.style.display = "none";
    }
}

finishBtn.addEventListener('click', async () => {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    // ------------------------
    // Read selected time filters
    // ------------------------
    const startTime = parseFloat(document.getElementById('start-time').value);
    const endTime = parseFloat(document.getElementById('end-time').value);

    // ------------------------
    // Read checked days
    // ------------------------
    const checkedDays = Array.from(document.querySelectorAll('#day-filters input[type=checkbox]:checked'))
                             .map(cb => cb.value);

    // ------------------------
    // Filter cart courses by time AND days
    // ------------------------
    const filteredCart = cart.map(course => {
        const newCourse = JSON.parse(JSON.stringify(course)); // deep copy
        const filteredComponents = {};

        Object.keys(course.components).forEach(type => {
            filteredComponents[type] = course.components[type].filter(sec => {
                const parsed = parseTimeRange(sec.time);
                if (!parsed) return false;

                // Check time
                const inTime = parsed.start >= startTime && parsed.end <= endTime;

                // Check days
                const secDays = sec.days.split("").filter(d => ["M","T","W","R","F"].includes(d));
                const inDays = secDays.some(d => checkedDays.includes(d));

                return inTime && inDays;
            });
        });

        newCourse.components = filteredComponents;
        return newCourse;
    });

    // ------------------------
    // Generate schedules
    // ------------------------
    const response = await fetch(
        "http://127.0.0.1:5000/generate-schedules",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                cart: cart.map(c => c.id)
            })
        }
    );

    const result = await response.json();
    const schedules = result.schedules;

    if (schedules.length === 0) {
        alert("No valid schedules found with the selected time range and days!");
        return;
    }

    // ------------------------
    // Render schedules
    // ------------------------
    renderSchedules(schedules);
});


// ------------------------
// Modular render function
// ------------------------
function renderSchedules(schedules) {
    const MAX_DISPLAY = 300;
    const newWindow = window.open("", "_blank");

    newWindow.document.write(`
    <html>
    <head>
    <title>Generated Schedules</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            padding: 2%; 
            background: #f4f6f9;
        }

        .schedule { 
            border: 1px solid #d9d9d9; 
            margin: 20px 0; 
            padding: 16px; 
            border-radius: 14px; 
            background: #ffffff;
            box-shadow: 0 8px 18px rgba(7, 41, 77, 0.08);
        }

        .schedule h3 { 
            margin: 0 0 10px 0; 
            color: #07294d;
        }

        .scroll-container { 
            max-height: 90vh; 
            overflow-y: auto; 
        }

        table { 
            width: 100%; 
            border-collapse: collapse; 
            table-layout: fixed; 
            margin-top: 10px;
        }

        th { 
            background: #07294d; 
            color: white; 
            font-weight: 600;
        }

        th, td { 
            border: 1px solid #e0e0e0; 
            text-align: center; 
            position: relative; 
        }

        td.time-label { 
            width: 40px; 
            font-weight: 500;
            color: #555;
        }

        .class-block { 
            position: absolute; 
            left: 2px; 
            right: 2px; 
            border-radius: 6px; 
            padding: 4px; 
            font-size: 11px; 
            overflow: hidden; 
            color: #1a1a1a; 
            box-shadow: 0 3px 8px rgba(0,0,0,0.12);
        }

        /* 🔥 NEW DOWNLOAD BUTTON DESIGN */
        .download-btn {
            padding: 8px 18px;
            border-radius: 999px;
            border: none;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.4px;
            background: linear-gradient(135deg, #07294d, #0b4aa2);
            color: white;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: 0 4px 10px rgba(7, 41, 77, 0.25);
        }

        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(7, 41, 77, 0.35);
            background: linear-gradient(135deg, #0b4aa2, #07294d);
        }

        .download-btn:active {
            transform: translateY(0);
            box-shadow: 0 3px 8px rgba(7, 41, 77, 0.2);
        }
    </style>

    </head>
    <body>
        <h1>All Possible Schedules</h1>
        <div class="scroll-container" id="schedule-container"></div>
    </body>
    </html>
    `);

    const container = newWindow.document.getElementById("schedule-container");
    const DAYS = ["M", "T", "W", "R", "F"];
    const colorPalette = ["#FFB3BA","#BAE1FF","#BAFFC9","#FFFFBA","#FFDFBA","#E2BAFF","#BAFFD9"];
    let courseColors = {};

    function getColorForCourse(courseCode) {
        if (!courseColors[courseCode]) {
            const index = Object.keys(courseColors).length % colorPalette.length;
            courseColors[courseCode] = colorPalette[index];
        }
        return courseColors[courseCode];
    }

    schedules.slice(0, MAX_DISPLAY).forEach((sched, index) => {
        const schedDiv = newWindow.document.createElement("div");
        schedDiv.classList.add("schedule");

        const title = newWindow.document.createElement("h3");
        title.textContent = `Schedule #${index + 1}`;
        schedDiv.appendChild(title);

        const downloadBtn = newWindow.document.createElement("button");
        downloadBtn.textContent = "Download";
        downloadBtn.classList.add("download-btn");
      //when the user click the 
      downloadBtn.addEventListener("click", () => downloadScheduleAsPNG(sched, index +1, newWindow));
        const btnWrapper = newWindow.document.createElement("div");
        btnWrapper.style.display = "flex";

        btnWrapper.appendChild(downloadBtn);
        schedDiv.appendChild(btnWrapper);



        const table = newWindow.document.createElement("table");
        const header = newWindow.document.createElement("tr");
        header.innerHTML = `<th></th>` + DAYS.map(d => `<th>${d}</th>`).join("");
        table.appendChild(header);

        for (let hour = 8; hour <= 18; hour++) {
            const row = newWindow.document.createElement("tr");
            const label = newWindow.document.createElement("td");
            label.textContent = hour;
            label.classList.add("time-label");
            row.appendChild(label);

            DAYS.forEach(() => {
                const cell = newWindow.document.createElement("td");
                cell.style.height = "40px";
                row.appendChild(cell);
            });

            table.appendChild(row);
        }

        schedDiv.appendChild(table);
        container.appendChild(schedDiv);

        // Place classes
        sched.forEach(cls => {
            const dLetters = cls.days.split("").filter(d => DAYS.includes(d));
            const color = getColorForCourse(`${cls.subject} ${cls.course_number}`);

            dLetters.forEach(day => {
                const colIndex = DAYS.indexOf(day) + 1;
                const startHour = Math.floor(cls.start);
                const startMinutes = (cls.start - startHour) * 60;

                const startRow = startHour - 8 + 1;
                const duration = (cls.end - cls.start) * 40;
                const minuteOffset = (startMinutes / 60) * 40;

                const targetCell = table.rows[startRow].cells[colIndex];
                const block = newWindow.document.createElement("div");
                block.classList.add("class-block");
                block.style.top = `${minuteOffset}px`;
                block.style.height = `${duration}px`;
                block.style.background = color;

                block.innerHTML = `
                    <b>${cls.subject} ${cls.course_number}</b><br>
                    ${cls.type} (${cls.section})<br>
                    ${cls.days} ${formatTime(cls.start)}–${formatTime(cls.end)}
                `;

                targetCell.appendChild(block);
            });
        });
    });
}

const minSlider = document.getElementById('min-range');
const maxSlider = document.getElementById('max-range');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const rangeHighlight = document.querySelector('.range-highlight');

function updateSlider() {
    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    if (minVal > maxVal) {
        [minVal, maxVal] = [maxVal, minVal];
        minSlider.value = minVal;
        maxSlider.value = maxVal;
    }

    // Update hidden inputs for filtering
    startTimeInput.value = minVal;
    endTimeInput.value = maxVal;

    // Update highlight position
    const percentStart = ((minVal - 8) / 11) * 100;
    const percentWidth = ((maxVal - minVal) / 11) * 100;
    rangeHighlight.style.left = percentStart + '%';
    rangeHighlight.style.width = percentWidth + '%';

    // Update top labels
    const startLabel = document.getElementById('range-start');
    const endLabel = document.getElementById('range-end');
    const formatHour = h => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        return hour12 + ampm;
    };
    startLabel.textContent = formatHour(minVal);
    endLabel.textContent = formatHour(maxVal);
}

// Attach listeners
[minSlider, maxSlider].forEach(slider => slider.addEventListener('input', updateSlider));

// Initialize on page load
updateSlider();
//Download function
function downloadScheduleAsPNG(sched, scheduleNumber, win) {
    const DAYS = ["M", "T", "W", "R", "F"];
    const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const START_HOUR = 8;
    const END_HOUR = 20;
    const LABEL_W = 54;
    const COL_W = 140;
    const HEADER_H = 44;
    const PX_PER_MIN = 1.4;
    const BODY_H = (END_HOUR - START_HOUR) * 60 * PX_PER_MIN;
    const CANVAS_W = LABEL_W + COL_W * 5;
    const CANVAS_H = HEADER_H + BODY_H + 20;

    const canvas = (win || window).document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");

    const colorPalette = ["#FFB3BA","#BAE1FF","#BAFFC9","#FFFFBA","#FFDFBA","#E2BAFF","#BAFFD9"];
    const courseColors = {};
    function getCourseColor(key) {
        if (!courseColors[key]) {
            const idx = Object.keys(courseColors).length % colorPalette.length;
            courseColors[key] = colorPalette[idx];
        }
        return courseColors[key];
    }

    // Background
    ctx.fillStyle = "#f4f6f9";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Header
    ctx.fillStyle = "#07294d";
    ctx.fillRect(0, 0, CANVAS_W, HEADER_H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`Schedule #${scheduleNumber}`, LABEL_W + 8, 28);

    // Day labels
    ctx.font = "bold 13px Arial";
    DAYS.forEach((d, i) => {
        const x = LABEL_W + i * COL_W;
        ctx.fillStyle = "#07294d";
        ctx.fillRect(x, 0, COL_W, HEADER_H);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(DAY_LABELS[i], x + COL_W / 2, 28);
    });
    ctx.textAlign = "left";

    // White grid body
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(LABEL_W, HEADER_H, COL_W * 5, BODY_H);

    // Hour gridlines + time labels
    for (let h = START_HOUR; h <= END_HOUR; h++) {
        const y = HEADER_H + (h - START_HOUR) * 60 * PX_PER_MIN;
        ctx.strokeStyle = h % 2 === 0 ? "#cccccc" : "#eeeeee";
        ctx.lineWidth = h % 2 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(LABEL_W, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
        if (h < END_HOUR) {
            const ampm = h >= 12 ? "PM" : "AM";
            const h12 = h % 12 === 0 ? 12 : h % 12;
            ctx.fillStyle = "#888888";
            ctx.font = "10px Arial";
            ctx.textAlign = "right";
            ctx.fillText(`${h12}${ampm}`, LABEL_W - 4, y + 12);
            ctx.textAlign = "left";
        }
    }

    // Vertical dividers
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    DAYS.forEach((_, i) => {
        const x = LABEL_W + i * COL_W;
        ctx.beginPath();
        ctx.moveTo(x, HEADER_H);
        ctx.lineTo(x, HEADER_H + BODY_H);
        ctx.stroke();
    });

    // Class blocks
    sched.forEach(cls => {
        cls.days.split("").filter(d => DAYS.includes(d)).forEach(day => {
            const colIndex = DAYS.indexOf(day);
            if (colIndex === -1) return;
            const x = LABEL_W + colIndex * COL_W + 3;
            const y = HEADER_H + (cls.start - START_HOUR) * 60 * PX_PER_MIN;
            const w = COL_W - 6;
            const h = Math.max((cls.end - cls.start) * 60 * PX_PER_MIN, 18);
            const color = getCourseColor(`${cls.subject} ${cls.course_number}`);

            ctx.fillStyle = color;
            ctx.strokeStyle = "rgba(0,0,0,0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x, y + 1, w, h - 2, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#1a1a1a";
            ctx.font = "bold 11px Arial";
            ctx.fillText(`${cls.subject} ${cls.course_number}`, x + 5, y + 14);
            if (h > 30) {
                ctx.font = "10px Arial";
                ctx.fillText(`${cls.type} (${cls.section})`, x + 5, y + 26);
            }
            if (h > 44) {
                ctx.fillText(`${formatTime(cls.start)}–${formatTime(cls.end)}`, x + 5, y + 38);
            }
        });
    });

    // Gold left stripe to fit with the school colors, and to add a bit more design to the image.
    ctx.fillStyle = "#f5b700";
    ctx.fillRect(0, 0, 4, CANVAS_H);

    // Trigger download
    const link = (win || window).document.createElement("a");
  //this line below gives the name to the downloaded scheudle and adjust the number based on which number schedule the user downloads
    link.download = `drexel-schedule-${scheduleNumber}.png`;
// This line below converts the data from the schdule to a PNG
    link.href = canvas.toDataURL("image/png");
  // this line here triggers the download
    link.click();
}

updateCartUI();
