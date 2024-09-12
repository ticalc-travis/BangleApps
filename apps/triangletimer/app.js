const Layout = require('Layout');

const tt = require('triangletimer');

// UI //

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
    tt.set_last_viewed_timer(this.tri_timer);
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
               cb: () => {
                 switch_UI(new TimerViewMenu(this.tri_timer));
               }
              }
            ]
          }
        ]
      }
    );
    this.layout = layout;
  }

  render(item) {
    console.debug('render called: ' + item);

    if (!item) {
      this.layout.update();
      this.layout.clear();
    }

    if (!item || item == 'timer') {

      let timer_as_linear = this.tri_timer.get();
      if (timer_as_linear < 0) {
        // Handle countdown timer expiration
        timer_as_linear = 0;
        setTimeout(() => { this.render('status'); }, 0);
        setTimeout(() => { this.render('buttons'); }, 0);
      }
      const timer_as_tri = tt.as_triangle(
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
        this.tri_timer.is_running() ? 'Pause' : 'Start';
      this.layout.render(this.layout.buttons);
    }

    if (!item || item == 'status') {
      const origin_as_tri = tt.as_triangle(
        this.tri_timer.origin,
        this.tri_timer.increment
      );
      this.layout.row3.label =
        this.tri_timer.display_status()
        + ' ' + this.tri_timer.provisional_name();
      this.layout.clear(this.layout.row3);
      this.layout.render(this.layout.row3);
    }

    if (this.timer_timeout === null
        && this.tri_timer.is_running()
        && this.tri_timer.get() > 0) {
      // Calculate approximate time next display update is needed.
      // The + 50 is a compensating factor due to timeouts
      // apparently sometimes triggering too early.
      let next_tick = this.tri_timer.get() % 1;
      if (this.tri_timer.rate > 0) {
        next_tick = 1 - next_tick;
      }
      next_tick = next_tick / Math.abs(this.tri_timer.rate) + 50;

      this.timer_timeout = setTimeout(
        () => { this.timer_timeout = null; this.render('timer'); },
        next_tick
      );
    }
  }

  start_stop_timer() {
    if (this.tri_timer.is_running()) {
      this.tri_timer.pause();
    } else {
      this.tri_timer.start();
    }
    this.render('buttons');
    this.render('status');
    this.render('timer');
    tt.set_timers_dirty();
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
    switch_UI(new TimerView(this.tri_timer));
  }

  top_menu() {
    const top_menu = {
      '': {
        title: this.tri_timer.display_name(),
        back: this.back.bind(this)
      },
      'Reset': () => { E.showMenu(reset_menu); },
      'Timers': () => {
        switch_UI(new TimerMenu(tt.TIMERS, this.tri_timer));
      },
      'Edit': this.edit_menu.bind(this),
      'Add': () => {
        tt.set_timers_dirty();
        const new_timer = tt.add_tri_timer(tt.TIMERS, this.tri_timer);
        const timer_view_menu = new TimerViewMenu(new_timer);
        timer_view_menu.edit_menu();
      },
      'Delete': () => { E.showMenu(delete_menu); },
    };
    if (tt.TIMERS.length <= 1) {
      // Prevent user deleting last timer
      delete top_menu.Delete;
    }

    const reset_menu = {
      '': {
        title: 'Confirm reset',
        back: () => { E.showMenu(top_menu); }
      },
      'Reset': () => {
        this.tri_timer.reset();
        tt.set_timers_dirty();
        this.back();
      },
      'Cancel': () => { E.showMenu(top_menu); },
    };

    const delete_menu = {
      '': {
        title: 'Confirm delete',
        back: () => { E.showMenu(top_menu); }
      },
      'Delete': () => {
        tt.set_timers_dirty();
        switch_UI(new TimerView(tt.delete_tri_timer(tt.TIMERS, this.tri_timer)));
      },
      'Cancel': () => { E.showMenu(top_menu); },
    };

    E.showMenu(top_menu);
  }

  edit_menu() {
    const edit_menu = {
      '': {
        title: 'Edit: ' + this.tri_timer.display_name(),
        back: () => { this.top_menu(); },
      },
      'Direction': {
        value: this.tri_timer.rate >= 0,
        format: v => (v ? 'Up' : 'Down'),
        onchange: v => {
          this.tri_timer.rate = -this.tri_timer.rate;
          tt.set_timers_dirty();
        }
      },
      'Start (Tri)': this.edit_start_tri_menu.bind(this),
      'Start (HMS)': this.edit_start_hms_menu.bind(this),
      'Increment': {
        value: this.tri_timer.increment,
        min: 1,
        max: 9999,
        step: 1,
        wrap: true,
        onchange: v => {
          this.tri_timer.increment = v;
          tt.set_timers_dirty();
        },
      },
      'Events': this.edit_events_menu.bind(this),
    };

    E.showMenu(edit_menu);
  }

  edit_start_tri_menu() {
    let origin_tri = tt.as_triangle(
      this.tri_timer.origin, this.tri_timer.increment);

    const edit_start_tri_menu = {
      '': {
        title: 'Start (Tri)',
        back: this.edit_menu.bind(this),
      },
      'Outer': {
        value: origin_tri[0],
        min: 0,
        max: Math.floor(9999 / this.tri_timer.increment)
          * this.tri_timer.increment,
        step: this.tri_timer.increment,
        wrap: true,
        noList: true,
        onchange: v => {
          origin_tri[0] = v;
          edit_start_tri_menu.Inner.max = origin_tri[0];
          origin_tri[1] = (this.tri_timer.rate >= 0) ?
            1 : origin_tri[0];
          edit_start_tri_menu.Inner.value = origin_tri[1];
          this.tri_timer.origin = tt.as_linear(
            origin_tri, this.tri_timer.increment
          );
          tt.set_timers_dirty();
        }
      },
      'Inner': {
        value: origin_tri[1],
        min: 0,
        max: origin_tri[0],
        step: 1,
        wrap: true,
        noList: true,
        onchange: v => {
          origin_tri[1] = v;
          this.tri_timer.origin = tt.as_linear(
            origin_tri, this.tri_timer.increment
          );
          tt.set_timers_dirty();
        }
      },
    };

    E.showMenu(edit_start_tri_menu);
  }

  edit_start_hms_menu() {
    let origin_hms = {
      h: Math.floor(this.tri_timer.origin / 3600),
      m: Math.floor(this.tri_timer.origin / 60) % 60,
      s: Math.floor(this.tri_timer.origin % 60),
    };

    function update_origin() {
      this.tri_timer.origin = origin_hms.h * 3600
        + origin_hms.m * 60
        + origin_hms.s;
    }

    const edit_start_hms_menu = {
      '': {
        title: 'Start (HMS)',
        back: this.edit_menu.bind(this),
      },
      'Hours': {
        value: origin_hms.h,
        min: 0,
        max: 9999,
        wrap: true,
        onchange: v => {
          origin_hms.h = v;
          update_origin();
          tt.set_timers_dirty();
        }
      },
      'Minutes': {
        value: origin_hms.m,
        min: 0,
        max: 59,
        wrap: true,
        onchange: v => {
          origin_hms.m = v;
          update_origin();
          tt.set_timers_dirty();
        }
      },
      'Seconds': {
        value: origin_hms.s,
        min: 0,
        max: 59,
        wrap: true,
        onchange: v => {
          origin_hms.s = v;
          update_origin();
          tt.set_timers_dirty();
        }
      },
    };

    E.showMenu(edit_start_hms_menu);
  }

  edit_events_menu() {
    const events_menu = {
      '': {
        title: 'Events',
        back: () => { this.edit_menu(); }
      },
      'Outer alarm': {
        value: this.tri_timer.outer_alarm,
        format: v => (v ? 'On' : 'Off'),
        onchange: v => { this.tri_timer.outer_alarm = v; },
      },
      'Outer action': {
        value: tt.ACTIONS.indexOf(this.tri_timer.outer_action),
        min: 0,
        max: tt.ACTIONS.length - 1,
        format: v => tt.ACTIONS[v],
        onchange: v => { this.tri_timer.outer_action = tt.ACTIONS[v]; },
      },
      'End alarm': {
        value: this.tri_timer.end_alarm,
        format: v => (v ? 'On' : 'Off'),
        onchange: v => { this.tri_timer.end_alarm = v; },
      },
    };

    E.showMenu(events_menu);
  }
}


class TimerMenu {
  constructor(tri_timers, focused_timer) {
    this.tri_timers = tri_timers;
    this.focused_timer = focused_timer;
  }

  start() {
    this.top_menu();
  }

  stop() {
    E.showMenu();
  }

  back() {
    switch_UI(new TimerViewMenu(this.focused_timer));
  }

  top_menu() {
    let menu = {
      '': {
        title: "Timers",
        back: this.back.bind(this)
      }
    };
    this.tri_timers.forEach((tri_timer) => {
      menu[tri_timer.display_status() + ' ' + tri_timer.display_name()] =
        () => { switch_UI(new TimerView(tri_timer)); };
    });
    E.showMenu(menu);
  }
}


function switch_UI(new_UI) {
  if (CURRENT_UI) {
    CURRENT_UI.stop();
  }
  CURRENT_UI = new_UI;
  CURRENT_UI.start();
}


// Load and start up app //

Bangle.loadWidgets();
Bangle.drawWidgets();

var CURRENT_UI = null;

tt.update_system_alarms();

switch_UI(new TimerView(tt.TIMERS[0]));
