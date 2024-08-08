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
    loaded_timer = new this(data.origin, data.rate, false);
    loaded_timer._start_time = data.start_time;
    loaded_timer._pause_time = data.pause_time;
    return loaded_timer;
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
  constructor(triangle_timer) {
    this.triangle_timer = triangle_timer;

    this.layout = null;
    this.listeners = {};
    this.timer_timeout = null;
  }

  start() {
    this._initLayout();
    this.layout.clear();
    this.render();
  }

  stop () {
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
            font: 'Vector:35x55',
          },
          {
            type: 'txt',
            id: 'row2',
            label: '88:88:88',
            font: 'Vector:35x40',
          },
          {
            type: 'txt',
            id: 'row3',
            label: '88:88:88',
            font: 'Vector:25',
          },
          {
            type: 'h',
            id: 'buttons',
            c: [
              {type: 'btn', font: '6x8:2', fillx: 1, label: 'St/Pa', id: 'start_btn',
               cb: this.start_stop_timer.bind(this)},
              {type: 'btn', font: '6x8:2', fillx: 1, label: 'Menu', id: 'menu_btn',
               cb: this.start_menu.bind(this)},
            ]
          }
        ]
      }
    );
    this.layout = layout;
  }

  render(item) {
    if (!item) {
      this.layout.update();
      this.layout.clear();
    }

    if (!item || item == 'timer') {

      const timer_as_tri = as_triangle(
        this.triangle_timer.timer.get(),
        this.triangle_timer.increment
      );

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
        this.triangle_timer.timer.is_running() ? 'Pause' : 'Start';
      this.layout.render(this.layout.buttons);
    }

    if (!item || item == 'status') {
      const origin_as_tri = as_triangle(
        this.triangle_timer.timer.origin,
        this.triangle_timer.increment
      );
      this.layout.row3.label =
        (this.triangle_timer.timer.is_running() ? '>' : '')
          + origin_as_tri[0]
          + '/'
          + origin_as_tri[1];
      this.layout.clear(this.layout.row3);
      this.layout.render(this.layout.row3);
    }

    if (this.timer_timeout === null && this.triangle_timer.timer.is_running()) {
      this.timer_timeout = setTimeout(
        () => { this.timer_timeout = null; this.render('timer'); },
        (1 - this.triangle_timer.timer.get() % 1)
          / this.triangle_timer.timer.rate + 50,
        // Calculate approximate time next display update is needed.
        // The + 50 is a compensating factor due to timeouts
        // apparently sometimes triggering too early.
      );
    }
  }

  start_stop_timer() {
    if (this.triangle_timer.timer.is_running()) {
      this.triangle_timer.timer.pause();
    } else {
      this.triangle_timer.timer.start();
    }
    this.render('buttons');
    this.render('status');
  }

  start_menu() {
    menu_UI = new TimerViewMenu(
      () => { switch_UI(this); },
      this.triangle_timer
    );
    switch_UI(menu_UI);
  }
}


class TimerViewMenu {
  constructor(back_cb, triangle_timer) {
    this.triangle_timer = triangle_timer;
    this.back_cb = back_cb;

    this.do_reset = false;
  }

  start() {
    this.top_menu();
  }

  stop() {
    if (this.do_reset) {
      this.triangle_timer.timer.reset();
    }
    this.back_cb();
  }

  reset_timer() {
    this.nested_timer.timer.reset();
  }

  top_menu() {
    const reset_title = this.do_reset ? 'Undo reset' : 'Reset';

    menu = {
      '': {
        title: this.triangle_timer.name,
        back: this.stop.bind(this)
      }
    }
    menu[reset_title] = ()=>{ this.do_reset = !this.do_reset; };

    E.showMenu(menu);
  }
}


function switch_UI(newUI) {
  currentUI.stop();
  currentUI = newUI;
  currentUI.start();
}


Bangle.loadWidgets();
Bangle.drawWidgets();

// TODO: Specific class object for nested timers?
triangle_timer = {
  name: 'Test',
  timer: new PrimitiveTimer(0, 0.001, true),
  increment: 1,
};

var currentUI = new TimerView(triangle_timer);
currentUI.start();
