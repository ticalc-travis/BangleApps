const Layout = require('Layout');


class PrimitiveTimer {
  constructor(origin, rate, is_running) {
    this.origin = origin;
    this.rate = rate;

    this._start_time = Date.now();
    this._pause_time = is_running ? null : this._start_time;
  }

  is_running() {
    return !this._pause_time;
  }

  start() {
    if (!this.is_running()) {
      this._start_time += Date.now() - this._pause_time;
      this._pause_time = null;
    }
  }

  pause() {
    if (this.is_running()) {
      this._pause_time = Date.now();
    }
  }

  reset() {
    this.set(this.origin);
  }

  get() {
    const now = Date.now();
    const elapsed =
          (now - this._start_time)
          - (this.is_running() ? 0 : (now - this._pause_time));
    return this.origin + (this.rate * elapsed);
  }

  set(new_value) {
    const now = Date.now();
    this._start_time = (now - new_value / this.rate)
      + (this.origin / this.rate);
    if (!this.is_running()) {
      this._pause_time = now;
    }
  }

  dump() {
    return {
      cls: 'PrimitiveTimer',
      version: 0,
      origin: this.origin,
      rate: this.rate,
      start_time: this._start_time,
      pause_time: this._pause_time
    };
  }

  static load(data) {
    if (!(data.cls == 'PrimitiveTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading PrimitiveTimer state');
    }
    loaded = new this(data.origin, data.rate, false);
    loaded._start_time = data.start_time;
    loaded._pause_time = data.pause_time;
    return loaded;
  }
}


class TriangleTimer {
  constructor(name, primitive_timer, increment) {
    this.name = name;
    this.timer = primitive_timer;
    if (increment === undefined) increment = 1;
    this.increment = increment;
  }

  display_name() {
    if (this.name) {
      return this.name;
    } else {
      return this.provisional_name();
    }
  }

  provisional_name() {
    const origin_as_tri = as_triangle(
      this.timer.origin,
      this.increment
    );
    return this.display_status()
      + ' '
      + (this.timer.rate >= 0 ? 'U' : 'D')
      + ' '
      + origin_as_tri[0] + '/' + origin_as_tri[1]
      + ' x' + this.increment;
  }

  display_status() {
    let status = '';

    // Indicate timer expired if its current value is <= 0 and it's
    // a countdown timer
    if (this.timer.get() <= 0 && this.timer.rate < 0) {
      status += '!';
    }

    if (this.timer.is_running()) {
      status += '>';
    }

    return status;
  }

  dump() {
    return {
      cls: 'TriangleTimer',
      version: 0,
      name: this.name,
      timer: this.timer.dump(),
      increment: this.increment
    };
  }

  static load(data) {
    if (!(data.cls == 'TriangleTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading TriangleTimer state');
    }
    return new this(data.name, PrimitiveTimer.load(data.timer), data.increment);
  }
}


function fixed_ceil(value) {
  // JavaScript sucks balls
  return Math.ceil(Math.round(value * 1e10) / 1e10);
}


function as_triangle(linear_time, increment) {
  if (increment === undefined) increment = 1;
  linear_time = linear_time / increment;
  const outer = fixed_ceil((Math.sqrt(linear_time * 8 + 1) - 1) / 2);
  const inner = outer - (outer * (outer + 1) / 2 - linear_time);
  return [outer * increment, inner * increment];
}


function as_linear(triangle_time, increment) {
  if (increment === undefined) increment = 1;
  const outer = triangle_time[0], inner = triangle_time[1];
  return (outer + (outer - 1) % increment + 1)
    * fixed_ceil(outer / increment) / 2
    - outer + inner;
}


//// UI ////


class TimerView {
  constructor(tri_timer) {
    this.tri_timer = tri_timer;

    this.layout = null;
    this.listeners = {};
    this.timer_timeout = null;
  }

  start() {
    this._initLayout();
    this.layout.clear();
    this.render();
  }

  stop() {
    if (this.timer_timeout !== null) {
      clearTimeout(this.timer_timeout);
      this.timer_timeout = null;
    }
    Bangle.setUI();
  }

  _initLayout() {
    const layout = new Layout(
      {
        type: 'v',
        bgCol: g.theme.bg,
        c: [
          {
            type: 'txt',
            id: 'row1',
            label: '88:88:88',
            font: 'Vector:35x56',
            fillx: 1,
          },
          {
            type: 'txt',
            id: 'row2',
            label: '88:88:88',
            font: 'Vector:35x42',
            fillx: 1,
          },
          {
            type: 'txt',
            id: 'row3',
            label: '88:88:88',
            font: '12x20',
            fillx: 1,
          },
          {
            type: 'h',
            id: 'buttons',
            c: [
              {type: 'btn', font: '6x8:2', fillx: 1, label: 'St/Pa', id: 'start_btn',
               cb: this.start_stop_timer.bind(this)},
              {type: 'btn', font: '6x8:2', fillx: 1, label: 'Menu', id: 'menu_btn',
               cb: () => { this.emit('timer_view_menu'); }},
            ]
          }
        ]
      }
    );
    this.layout = layout;
  }

  render(item) {
    const timer = this.tri_timer.timer;
    console.debug('render called: ' + item);

    if (!item) {
      this.layout.update();
      this.layout.clear();
    }

    if (!item || item == 'timer') {

      let timer_as_linear = timer.get();
      if (timer_as_linear < 0) {
        // Handle countdown timer expiration
        timer_as_linear = 0;
        setTimeout(() => { this.render('status'); }, 0);
        setTimeout(() => { this.render('buttons'); }, 0);
      }
      const timer_as_tri = as_triangle(
        timer_as_linear, this.tri_timer.increment);

      let label = timer_as_tri[0];
      if (label != this.layout.row1.label) {
        this.layout.row1.label = label;
        this.layout.clear(this.layout.row1);
        this.layout.render(this.layout.row1);
      }

      label = timer_as_tri[1];
      if (label != this.layout.row2.label) {
        this.layout.row2.label = Math.ceil(timer_as_tri[1]);
        this.layout.clear(this.layout.row2);
        this.layout.render(this.layout.row2);
      }

    }

    if (!item || item == 'buttons') {
      this.layout.start_btn.label =
        timer.is_running() ? 'Pause' : 'Start';
      this.layout.render(this.layout.buttons);
    }

    if (!item || item == 'status') {
      const origin_as_tri = as_triangle(
        timer.origin,
        this.tri_timer.increment
      );
      this.layout.row3.label =
        this.tri_timer.provisional_name();
      this.layout.clear(this.layout.row3);
      this.layout.render(this.layout.row3);
    }

    if (this.timer_timeout === null
        && timer.is_running()
        && timer.get() > 0) {
      // Calculate approximate time next display update is needed.
      // The + 50 is a compensating factor due to timeouts
      // apparently sometimes triggering too early.
      let next_tick = timer.get() % 1;
      if (timer.rate > 0) {
        next_tick = 1 - next_tick;
      }
      next_tick = next_tick / Math.abs(timer.rate) + 50;

      this.timer_timeout = setTimeout(
        () => { this.timer_timeout = null; this.render('timer'); },
        next_tick
      );
    }
  }

  start_stop_timer() {
    if (this.tri_timer.timer.is_running()) {
      this.tri_timer.timer.pause();
    } else {
      this.tri_timer.timer.start();
    }
    this.render('buttons');
    this.render('status');
  }
}


class TimerViewMenu {
  constructor(tri_timer) {
    this.tri_timer = tri_timer;
  }

  start() {
    this.top_menu();
  }

  stop() {
    E.showMenu();
  }

  back() {
    this.emit('back');
  }

  reset_timer() {
    this.tri_timer.timer.reset();
  }

  top_menu() {
    top_menu = {
      '': {
        title: this.tri_timer.display_name(),
        back: this.back.bind(this)
      },
      'Reset': () => { E.showMenu(reset_menu); },
      'Edit': this.edit_menu.bind(this),
      // TODO: Add
      // TODO: Delete
      'Timers': () => { this.emit('timer_menu'); }
    };

    reset_menu = {
      '': {
        title: 'Confirm reset',
        back: () => { E.showMenu(top_menu); }
      },
      'Reset': () => {
        this.tri_timer.timer.reset();
        this.back();
      },
      'Cancel': () => { E.showMenu(top_menu); },
    };

    E.showMenu(top_menu);
  }

  edit_menu() {
    let origin_tri = as_triangle(
      this.tri_timer.timer.origin, this.tri_timer.increment);

    edit_menu = {
      '': {
        title: 'Edit: ' + this.tri_timer.display_name(),
        back: () => { this.top_menu(); },
      },
      'Direction': {
        value: this.tri_timer.timer.rate,
        format: v => (v >= 0 ? 'Up' : 'Down'),
        onchange: v => { v = (v >= 0 ? -0.001 : 0.001); },
      },
      'Start (Tri)': () => { E.showMenu(edit_start_tri_menu); },
      'Start (HMS)': () => { E.showMenu(edit_start_hms_menu); },
      'Increment': {
        value: this.tri_timer.increment,
        min: 1,
        max: 9999,
        step: 1,
        onchange: v => {
          this.tri_timer.increment = v;
          edit_start_tri_menu.Outer.step = v;
        },
      }
    };

    edit_start_tri_menu = {
      '': {
        title: 'Start (Tri)',
        back: () => { E.showMenu(edit_menu); },
      },
      'Outer': {
        value: origin_tri[0],
        min: 1,
        max: 9999,
        step: this.tri_timer.increment,
        onchange: v => {
          origin_tri[0] = v;
          edit_start_tri_menu.Inner.max = origin_tri[0];
          origin_tri[1] = (this.tri_timer.timer.rate >= 0) ?
            1 : origin_tri[0];
          edit_start_tri_menu.Inner.value = origin_tri[1];
          this.tri_timer.timer.origin = as_linear(
            origin_tri, this.tri_timer.increment
          );
        }
      },
      'Inner': {
        value: origin_tri[1],
        min: 1,
        max: origin_tri[0],
        step: 1,
        onchange: v => {
          origin_tri[1] = v;
          this.tri_timer.timer.origin = as_linear(
            origin_tri, this.tri_timer.increment
          );
        }
      },
    };

    edit_start_hms_menu = {
      
    };

    E.showMenu(edit_menu);
  }
}


class TimerMenu {
  constructor(tri_timers) {
    this.tri_timers = tri_timers;
  }

  start() {
    this.top_menu();
  }

  stop() {
    E.showMenu();
  }

  back() {
    this.emit('back');
  }

  top_menu() {
    let menu = {
      '': {
        title: "Timers",
        back: this.back.bind(this)
      }
    };
    this.tri_timers.forEach((tri_timer) => {
      menu[tri_timer.display_name()] = () => {
        this.emit('view_timer', tri_timer);
      };
    });
    E.showMenu(menu);
  }
}


function switch_UI(new_UI) {
  if (current_UI) {
    current_UI.stop();
  }
  current_UI = new_UI;
  current_UI.start();
}


function set_timer_view(tri_timer) {
  const timer_view = new TimerView(tri_timer);
  switch_UI(timer_view);
  timer_view.on(
    'timer_view_menu', () => { set_timer_view_menu(tri_timer); }
  );
}

function set_timer_view_menu(tri_timer) {
  const timer_view_menu = new TimerViewMenu(tri_timer);
  switch_UI(timer_view_menu);
  timer_view_menu.on(
    'back', () => { set_timer_view(tri_timer); }
  );
  timer_view_menu.on(
    'timer_menu', () => { set_timer_menu(tri_timer); }
  );
}

function set_timer_menu(tri_timer) {
  const timer_menu = new TimerMenu(tri_timers);
  switch_UI(timer_menu);
  timer_menu.on(
    'back', () => { set_timer_view_menu(tri_timer); }
  );
  timer_menu.on(
    'view_timer', (timer) => { set_timer_view(timer); }
  );
}


Bangle.loadWidgets();
Bangle.drawWidgets();

tri_timer = new TriangleTimer(
  'Up',
  new PrimitiveTimer(210, 0.001, false),
  10
);
tri_timers = [tri_timer];
let tri_timer = new TriangleTimer(
  'Down',
  new PrimitiveTimer(55, -0.001, false),
  1
);
tri_timers.push(tri_timer);
tri_timer = tri_timers[0];

current_UI = null;
set_timer_view(tri_timer);

const timer_view = new TimerView(tri_timer);
const timer_view_menu = new TimerViewMenu(tri_timer);