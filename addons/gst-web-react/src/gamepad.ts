/**
 * Менеджер для работы с геймпадами
 * Основан на https://github.com/parsec-cloud/web-client/blob/master/src/gamepad.js
 */

const GP_TIMEOUT = 16;
const MAX_GAMEPADS = 4;

interface GamepadState {
  axes: number[];
  buttons: number[];
}

export class GamepadManager {
  private gamepad: Gamepad;
  public numButtons: number;
  public numAxes: number;
  private onButton: (gpNum: number, btnNum: number, val: number) => void;
  private onAxis: (gpNum: number, axisNum: number, val: number) => void;
  private state: Record<number, GamepadState> = {};
  private interval: number;

  constructor(
    gamepad: Gamepad,
    onButton: (gpNum: number, btnNum: number, val: number) => void,
    onAxis: (gpNum: number, axisNum: number, val: number) => void
  ) {
    this.gamepad = gamepad;
    this.numButtons = gamepad.buttons.length;
    this.numAxes = gamepad.axes.length;
    this.onButton = onButton;
    this.onAxis = onAxis;
    this.interval = window.setInterval(() => {
      this.poll();
    }, GP_TIMEOUT);
  }

  private poll(): void {
    const gamepads = navigator.getGamepads();

    for (let i = 0; i < MAX_GAMEPADS; i++) {
      if (gamepads[i]) {
        let gp = this.state[i];

        if (!gp) {
          gp = this.state[i] = { axes: [], buttons: [] };
        }

        for (let x = 0; x < gamepads[i]!.buttons.length; x++) {
          const value = gamepads[i]!.buttons[x]!.value;

          if (gp.buttons[x] !== undefined && gp.buttons[x] !== value) {
            this.onButton(i, x, value);
          }

          gp.buttons[x] = value;
        }

        for (let x = 0; x < gamepads[i]!.axes.length; x++) {
          let val = gamepads[i]!.axes[x]!;
          if (Math.abs(val) < 0.05) val = 0;

          if (gp.axes[x] !== undefined && gp.axes[x] !== val) {
            // Нормализуем значение оси в диапазон [0, 255]
            const normalizedVal = Math.round(((val + 1) / 2) * 255);
            this.onAxis(i, x, normalizedVal);
          }

          gp.axes[x] = val;
        }
      } else if (this.state[i]) {
        delete this.state[i];
      }
    }
  }

  destroy(): void {
    clearInterval(this.interval);
  }
}


