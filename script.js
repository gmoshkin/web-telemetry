/* TODO:
 * - display module name on the left on each of the lanes
 * - display section name inside the rectangle, truncate obviously
 * - show stats for the currently highlighted section:
 *    - count appearances
 *    - total duration
 *    - mean/average/standard deviation
 */
const canvas = document.getElementById("canvas");
canvas.width = 1300;
canvas.height = 600;
const ctx = canvas.getContext("2d");

setInterval(redraw, 17);

var mode = null;
var lastButton = null;

var mouseDown = 0;
let mousePos = null;
let mouse_x = null;
let mouse_y = null;
let mouse_x_start = null;
let mouse_y_start = null;
var selected = null;

var data = JSON.parse(DATA);
var nanos_per_pixel_log = 10;
var nanos_per_pixel = null;
let current_scale = null;

var modules_by_name = {};
var modules_by_id = [];
var sections = {};

let start_min = data[0][2];
for (let i = 0; i < data.length; i++) {
    let [module, section, start, duration] = data[i];
    if (modules_by_name[module] === undefined) {
        modules_by_name[module] = modules_by_id.length;
        modules_by_id.push(module);
    }
    if (sections[section] === undefined) sections[section] = Object.keys(sections).length;
    data[i] = {
        module_id: modules_by_name[module],
        section_id: sections[section],
        start: start - start_min,
        duration,
    };
}

let section_keys = Object.keys(sections)
for (let i = 0; i < section_keys.length; i++) sections[i] = section_keys[i];

const Mue = '\xb5';

////////////////////////////////////////////////////////////////////////////////
// input handling

let scroll_x_nanos = data[1].start;

canvas.onmousemove = (event) => {
    update_mouse_position(event)
};
canvas.onmousedown = (event) => {
    update_mouse_position(event)
    mouseDown = event.which;
    mouse_x_start = mouse_x;
    mouse_y_start = mouse_y;
};
canvas.onmouseup = (event) => { mouseDown = false };

addEventListener("wheel", (event) => {
    if (event.target != canvas) return;
    event.preventDefault();

    update_mouse_position(event);

    if (event.wheelDeltaX) do_horizontal_scrolling(-event.wheelDeltaX);
    if (event.wheelDeltaY) {
        if (event.ctrlKey) do_zooming(-event.wheelDeltaY/2);
        else do_horizontal_scrolling(event.wheelDeltaY);
    }
    if (event.deltaZ) do_zooming(event.deltaZ);
}, {passive: false});

let canvas_rect = canvas.getBoundingClientRect();
function update_mouse_position(event) {
    mouse_x = event.clientX - canvas_rect.x;
    mouse_y = event.clientY - canvas_rect.y;
}

function do_horizontal_scrolling(delta) {
    scroll_x_nanos += nanos_per_pixel * delta;
    clamp_horizontal_scroll();
}

let min_nanos_per_pixel_log = Math.log(1/100);
function do_zooming(delta) {
    nanos_per_pixel_log += delta / 500;
    let last_data = data[data.length - 1];
    let total_duration = last_data.start + last_data.duration - data[0].start;
    let max_nanos_per_pixel_log = Math.log(total_duration / 100);
    if (nanos_per_pixel_log < min_nanos_per_pixel_log) nanos_per_pixel_log = min_nanos_per_pixel_log;
    if (nanos_per_pixel_log > max_nanos_per_pixel_log) nanos_per_pixel_log = max_nanos_per_pixel_log;

    let nanos_per_pixel_was = nanos_per_pixel;
    nanos_per_pixel = Math.exp(nanos_per_pixel_log);
    scroll_x_nanos -= mouse_x * (nanos_per_pixel - nanos_per_pixel_was);
    clamp_horizontal_scroll();
}

function clamp_horizontal_scroll() {
    let start = data[0].start - canvas.width * nanos_per_pixel;
    let last_data = data[data.length - 1];
    let end = last_data.start + last_data.duration;
    if (scroll_x_nanos < start) scroll_x_nanos = start;
    if (scroll_x_nanos > end) scroll_x_nanos = end;
}

////////////////////////////////////////////////////////////////////////////////
// redraw

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    nanos_per_pixel = Math.exp(nanos_per_pixel_log);

    let scale = 1 / nanos_per_pixel;

    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'black';

    let y = 10;
    ctx.lineWidth = 1;

    // Draw highlighted region
    draw_highlighted_region();

    // Draw scale ruler
    y = draw_scale_ruler(y);

    //
    // Draw sections rectangles
    //
    ctx.fillStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';

    let highlighted_sections = [];
    let super_highlighted_section = null;

    var height = 20;
    var x = 0;
    let top = y + 10;

    i = 0;
    let sanity_check = 1000;
    let current_module_separators = [];
    let current_module_start_x = [];
    let current_module_end_x = [];
    for (let module_id = 0; module_id < modules_by_id.length; module_id++) {
        current_module_separators[module_id] = [];
        current_module_start_x[module_id] = 0;
        current_module_end_x[module_id] = -Infinity;
    }
    ctx.fillStyle = 'red';
    // for (let i = 0; i < data.length; i++) {
    for (let i = 0; i < data.length; i++) {
        let { start, duration, module_id, section_id } = data[i];

        let x = (start - scroll_x_nanos) * scale;
        let y = top + module_id * height;
        let w = duration * scale;
        if (x + w < 0) continue;
        if (x > canvas.width) break;

        if (mouse_x >= x && mouse_x <= x + w) {
            highlighted_sections.push(data[i]);
            if (mouse_y >= y && mouse_y <= y + height)
                super_highlighted_section = data[i];
        }

        let prev_end = current_module_end_x[module_id];
        if (x - prev_end < 1) {
            current_module_separators[module_id].push(x + w);
            current_module_end_x[module_id] = x + w;
            continue;
        }

        let x0 = current_module_start_x[module_id];
        let x1 = current_module_end_x[module_id];
        ctx.fillRect(x0, y, x1 - x0, height);
        draw_thin_rect(x0, y, x1 - x0, height);

        let separators = current_module_separators[module_id];
        ctx.beginPath();
        for (let j = 0; j < separators.length - 1; j++) {
            let xj = separators[j];
            ctx.moveTo(xj, y);
            ctx.lineTo(xj, y + height);
        }
        ctx.stroke();

        current_module_start_x[module_id] = x
        separators.length = 0;
        separators.push(x + w);
        current_module_end_x[module_id] = x + w;

        if (sanity_check-- <= 0) break;
    }
    for (let module_id = 0; module_id < modules_by_id.length; module_id++) {
        let x0 = current_module_start_x[module_id];
        if (x0 == 0) continue;
        let x1 = current_module_end_x[module_id];
        let y = top + module_id * height;
        ctx.fillRect(x0, y, x1 - x0, height);
        draw_thin_rect(x0, y, x1 - x0, height);

        let separators = current_module_separators[module_id];
        ctx.beginPath();
        for (let j = 0; j < separators.length - 1; j++) {
            let xj = separators[j];
            ctx.moveTo(xj, y);
            ctx.lineTo(xj, y + height);
        }
        ctx.stroke();
    }

    //
    // Draw mouse stuff
    //
    ctx.fillStyle = '#80808080';
    ctx.fillRect(mouse_x, 0, 1, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = "20px bold serif";
    y = canvas.height - 2;

    y -= 20;

    //
    // Draw highlighted section text
    //
    if (super_highlighted_section) {
        let { start, duration, module_id, section_id } = super_highlighted_section;
        let x = (start - scroll_x_nanos) * scale;
        let y = top + module_id * height;
        let w = duration * scale;
        ctx.fillStyle = '#ff8080';
        ctx.fillRect(x, y, w, height);
    }
    for (let i = 0; i < highlighted_sections.length; i++) {
        let { start, duration, module_id, section_id } = highlighted_sections[i];

        {
            let x = (start - scroll_x_nanos) * scale;
            let y = top + module_id * height;
            let w = duration * scale;
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'yellow';
            draw_thin_rect(x, y, w, height);
        }

        let module = modules_by_id[module_id];
        let section = sections[section_id];
        ctx.fillStyle = 'black';
        ctx.fillText(`[${module}] ${section}: ${format_time(duration)} [start: ${format_time(start)}]`, 0 + 2, y);
        y -= 20;
    }

    // Draw highlighted region duration
    draw_highlighted_region_duration();

    if (super_highlighted_section) {
        let { start, duration, module_id, section_id } = super_highlighted_section;
        ctx.fillStyle = 'black';
        ctx.font = "18px bold serif";
        let module = modules_by_id[module_id];
        let section = sections[section_id];
        x = mouse_x + 4;
        let y = top + module_id * height + 36;
        ctx.fillText(`[${module}] ${section}: ${format_time(duration)}`, x, y);
    }
}

function format_time(nanos, scale) {
    let maximumFractionDigits = 3;
    if (nanos < 1000) {
        nanos = nanos.toLocaleString('en-US', { maximumFractionDigits });
        return `${nanos}ns`;
    }
    if (nanos < 1000_000) {
        if (scale && scale < 1000) maximumFractionDigits = 6;
        let micros = nanos / 1000;
        micros = micros.toLocaleString('en-US', { maximumFractionDigits });
        return `${micros}\xb5s`;
    }
    if (nanos < 1000_000_000) {
        if (scale && scale < 1000) maximumFractionDigits = 6;
        let millis = nanos / 1000_000;
        millis = millis.toLocaleString('en-US', { maximumFractionDigits });
        return `${millis}ms`;
    }

    if (scale && scale < 1000) maximumFractionDigits = 9;
    if (scale && scale < 1000_000) maximumFractionDigits = 6;
    let seconds = nanos / 1000_000_000;
    seconds = seconds.toLocaleString('en-US', { maximumFractionDigits });
    return `${seconds}s`;
}

function draw_thin_rect(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.stroke();
}

function draw_scale_ruler(y) {
    let x = 0;

    let pixels_per_nano = 1 / nanos_per_pixel;
    let mouse_nanos = scroll_x_nanos + mouse_x * nanos_per_pixel;

    // Determine the adequet scale
    let scale = 1;
    let scales = [];
    while (scales.length < 3 && scale < Infinity) {
        let pixels = pixels_per_nano * scale;
        if (pixels > 10 && pixels < 100) scales.push(scale);

        pixels = pixels_per_nano * scale * 2;
        if (pixels > 10 && pixels < 100) scales.push(scale * 2);

        pixels = pixels_per_nano * scale * 5;
        if (pixels > 10 && pixels < 100) scales.push(scale * 5);

        scale *= 10;
    }

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);

    h = 7;
    for (let i = 0; i < scales.length; i++) {
        let scale = scales[i];
        let closest_multiple = Math.ceil(scroll_x_nanos / scale) * scale;
        let x0 = (closest_multiple - scroll_x_nanos) * pixels_per_nano;
        let pixels = pixels_per_nano * scale;

        for (let x = x0; x < canvas.width; x += pixels) {
            ctx.moveTo(x, y - h / 2);
            ctx.lineTo(x, y + h / 2);
        }

        if (i == scales.length - 1) {
            current_scale = scale;
            ctx.stroke();

            y += 15;

            let mouse_closest_multiple = Math.floor(mouse_nanos / scale) * scale;
            let x0 = (mouse_closest_multiple - scroll_x_nanos) * pixels_per_nano;

            let text = `${format_time(scale)}`;
            ctx.font = "14px bold serif";
            let m = ctx.measureText(text);

            h /= 1.31;
            ctx.strokeStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(x0, y - h / 2);
            ctx.lineTo(x0, y + h / 2);

            ctx.moveTo(x0, y);
            let l = pixels / 2 - m.width / 2 - 3;
            ctx.lineTo(x0 + l, y);
            ctx.moveTo(x0 + pixels - l, y);
            ctx.lineTo(x0 + pixels, y);

            ctx.moveTo(x0 + pixels, y - h / 2);
            ctx.lineTo(x0 + pixels, y + h / 2);
            ctx.stroke();

            ctx.fillStyle = '#808080';
            y += 5;
            x = x0 + pixels / 2 - m.width / 2;
            ctx.fillText(text, x, y);
        }

        h *= 1.45;
    }

    y += 16;

    if (mouse_x !== null) {
        x = mouse_x + 4;
        ctx.fillText(`${format_time(mouse_nanos, current_scale)}`, x, y);
    }

    return y;
}

function draw_highlighted_region() {
    if (!mouseDown) return;

    ctx.fillStyle = '#8080f060';
    ctx.fillRect(mouse_x_start, 0, mouse_x - mouse_x_start, canvas.height);
}

function draw_highlighted_region_duration() {
    if (!mouseDown) return;

    let t0 = scroll_x_nanos + mouse_x_start * nanos_per_pixel;
    let t1 = scroll_x_nanos + mouse_x * nanos_per_pixel;
    let x = mouse_x + 6;
    let y = mouse_y - 6;
    ctx.fillStyle = 'black';
    ctx.font = '14px bold serif';
    ctx.fillText(`${format_time(Math.abs(t1 - t0))}`, x, y);
}

function format_float(f, d) {
    if (d === undefined) d = 3;
    return f.toLocaleString('en-US', { maximumFractionDigits: d });
}

function text_dimensions(text) {
    let metrics = ctx.measureText(text);
    return [metrics.width, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent];
}
