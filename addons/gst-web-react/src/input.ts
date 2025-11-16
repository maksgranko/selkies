/**
 * Обработка ввода для WebRTC веб-приложения
 */

import { GamepadManager } from './gamepad';
import { Queue } from './util';

export interface InputCallbacks {
  onmenuhotkey?: () => void;
  onfullscreenhotkey?: () => void;
  ongamepadconnected?: (gamepadId: string) => void;
  ongamepaddisconnected?: () => void;
  onresizeend?: () => void;
}

interface WindowMath {
  mouseMultiX: number;
  mouseMultiY: number;
  mouseOffsetX: number;
  mouseOffsetY: number;
  centerOffsetX: number;
  centerOffsetY: number;
  scrollX: number;
  scrollY: number;
  frameW: number;
  frameH: number;
}

type Listener = [EventTarget, string, EventListener];

/**
 * Упрощенная клавиатура для обработки клавиш
 * В будущем можно заменить на Guacamole.Keyboard
 */
class SimpleKeyboard {
  private element: Window | Document;
  public onkeydown: ((keysym: number) => void) | null = null;
  public onkeyup: ((keysym: number) => void) | null = null;
  private listeners: Listener[] = [];

  constructor(element: Window | Document) {
    this.element = element;
    this.setup();
  }

  private setup(): void {
    const keydownHandler = (e: KeyboardEvent) => {
      if (this.onkeydown) {
        const keysym = this.getKeysym(e);
        if (keysym !== null) {
          this.onkeydown(keysym);
        }
      }
    };

    const keyupHandler = (e: KeyboardEvent) => {
      if (this.onkeyup) {
        const keysym = this.getKeysym(e);
        if (keysym !== null) {
          this.onkeyup(keysym);
        }
      }
    };

    this.element.addEventListener('keydown', keydownHandler);
    this.element.addEventListener('keyup', keyupHandler);
    this.listeners.push([this.element, 'keydown', keydownHandler]);
    this.listeners.push([this.element, 'keyup', keyupHandler]);
  }

  private getKeysym(e: KeyboardEvent): number | null {
    // Простая маппинг для основных клавиш
    // В будущем можно использовать полную таблицу Guacamole
    const keyMap: Record<string, number> = {
      'Escape': 65307,
      'Enter': 65293,
      'Tab': 65289,
      'Backspace': 65288,
      'Delete': 65535,
      'ArrowUp': 65362,
      'ArrowDown': 65364,
      'ArrowLeft': 65361,
      'ArrowRight': 65363,
      'Home': 65360,
      'End': 65367,
      'PageUp': 65365,
      'PageDown': 65366,
      'F1': 65470,
      'F2': 65471,
      'F3': 65472,
      'F4': 65473,
      'F5': 65474,
      'F6': 65475,
      'F7': 65476,
      'F8': 65477,
      'F9': 65478,
      'F10': 65479,
      'F11': 65480,
      'F12': 65481,
    };

    if (keyMap[e.code]) {
      return keyMap[e.code];
    }

    // Для обычных символов используем charCode
    if (e.key.length === 1) {
      return e.key.charCodeAt(0);
    }

    return null;
  }

  reset(): void {
    // Сброс состояния клавиатуры
  }

  destroy(): void {
    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];
  }
}

export class Input {
  public element: HTMLVideoElement;
  private send: (data: string) => void;
  public mouseRelative: boolean = false;
  public m: WindowMath | null = null;
  private buttonMask: number = 0;
  private keyboard: SimpleKeyboard | null = null;
  private gamepadManager: GamepadManager | null = null;
  public x: number = 0;
  public y: number = 0;
  public cursorScaleFactor: number | null = null;

  private callbacks: InputCallbacks = {};
  private listeners: Listener[] = [];
  private listeners_context: Listener[] = [];
  private _queue: Queue<number> = new Queue();

  // Переменные для resize
  private _rtime: Date | null = null;
  private _rtimeout: boolean = false;
  private _rdelta: number = 500;

  // Переменные для мыши и тачпада
  private _allowTrackpadScrolling: boolean = true;
  private _allowThreshold: boolean = true;
  private _smallestDeltaY: number = 10000;
  private _wheelThreshold: number = 100;
  private _scrollMagnitude: number = 10;

  constructor(element: HTMLVideoElement, send: (data: string) => void) {
    this.element = element;
    this.send = send;
  }

  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Вычисляет масштабный коэффициент курсора когда клиент и сервер имеют разные разрешения
   */
  getCursorScaleFactor({ remoteResolutionEnabled = false }: { remoteResolutionEnabled?: boolean } = {}): void {
    if (remoteResolutionEnabled) {
      this.cursorScaleFactor = null;
      return;
    }

    const clientResolution = this.getWindowResolution();
    const serverHeight = this.element.videoHeight;
    const serverWidth = this.element.videoWidth;

    if (isNaN(serverWidth) || isNaN(serverHeight)) {
      console.log("Invalid video height and width");
      return;
    }

    if (Math.abs(clientResolution[0] - serverWidth) <= 10 && Math.abs(clientResolution[1] - serverHeight) <= 10) {
      return;
    }

    this.cursorScaleFactor = Math.sqrt((serverWidth ** 2) + (serverHeight ** 2)) / Math.sqrt((clientResolution[0] ** 2) + (clientResolution[1] ** 2));
  }

  /**
   * Обрабатывает события кнопок мыши и движения
   */
  private mouseButtonMovement = (event: MouseEvent): void => {
    const down = (event.type === 'mousedown' ? 1 : 0);
    let mtype = "m";

    if (event.type === 'mousemove' && !this.m) return;

    if (!document.pointerLockElement) {
      if (this.mouseRelative) {
        this.element.requestPointerLock().then(
          () => {
            console.log("pointer lock success");
          }
        ).catch(
          (e) => {
            console.log("pointer lock failed: ", e);
          }
        );
      }
    }

    // Горячая клавиша для включения pointer lock, Ctrl-Shift-LeftClick
    if (down && event.button === 0 && event.ctrlKey && event.shiftKey) {
      this.element.requestPointerLock().then(
        () => {
          console.log("pointer lock success");
        }
      ).catch(
        (e) => {
          console.log("pointer lock failed: ", e);
        }
      );
      return;
    }

    if (document.pointerLockElement) {
      mtype = "m2";
      if (this.cursorScaleFactor != null) {
        this.x = Math.trunc(event.movementX * this.cursorScaleFactor);
        this.y = Math.trunc(event.movementY * this.cursorScaleFactor);
      } else {
        this.x = event.movementX;
        this.y = event.movementY;
      }
    } else if (event.type === 'mousemove') {
      this.x = this.clientToServerX(event.clientX);
      this.y = this.clientToServerY(event.clientY);
    }

    if (event.type === 'mousedown' || event.type === 'mouseup') {
      const mask = 1 << event.button;
      if (down) {
        this.buttonMask |= mask;
      } else {
        this.buttonMask &= ~mask;
      }
    }

    const toks = [
      mtype,
      this.x,
      this.y,
      this.buttonMask,
      0
    ];

    this.send(toks.join(","));
    event.preventDefault();
  };

  /**
   * Обрабатывает touch события
   */
  private touch = (event: TouchEvent): void => {
    const mtype = "m";
    const mask = 1;

    if (event.type === 'touchstart') {
      this.buttonMask |= mask;
    } else if (event.type === 'touchend') {
      this.buttonMask &= ~mask;
    } else if (event.type === 'touchmove') {
      event.preventDefault();
    }

    this.x = this.clientToServerX(event.changedTouches[0].clientX);
    this.y = this.clientToServerY(event.changedTouches[0].clientY);

    const toks = [
      mtype,
      this.x,
      this.y,
      this.buttonMask,
      0
    ];

    this.send(toks.join(","));
  };

  /**
   * Сбрасывает порог если значения указателя относятся к типу мыши
   */
  private dropThreshold(): boolean {
    let count = 0;
    let val1 = this._queue.dequeue();
    while (!this._queue.isEmpty()) {
      const valNext = this._queue.dequeue();
      if (valNext !== undefined && valNext >= 80 && val1 === valNext) {
        count++;
      }
      val1 = valNext;
    }
    return count >= 2;
  }

  /**
   * Обертка для _mouseWheel для корректировки прокрутки в зависимости от устройства указателя
   */
  private mouseWheelWrapper = (event: WheelEvent): void => {
    const deltaY = Math.trunc(Math.abs(event.deltaY));

    if (this._queue.size() < 4) {
      this._queue.enqueue(deltaY);
    }

    if (this._queue.size() === 4) {
      if (this.dropThreshold()) {
        this._allowThreshold = false;
        this._smallestDeltaY = 10000;
      } else {
        this._allowThreshold = true;
      }
    }

    if (this._allowThreshold && this._allowTrackpadScrolling) {
      this._allowTrackpadScrolling = false;
      this.mouseWheel(event);
      setTimeout(() => this._allowTrackpadScrolling = true, this._wheelThreshold);
    } else if (!this._allowThreshold) {
      this.mouseWheel(event);
    }
  };

  /**
   * Обрабатывает события колесика мыши
   */
  private mouseWheel = (event: WheelEvent): void => {
    const mtype = (document.pointerLockElement ? "m2" : "m");
    let button = 3;
    if (event.deltaY < 0) {
      button = 4;
    }

    let deltaY = Math.abs(Math.trunc(event.deltaY));

    if (deltaY < this._smallestDeltaY && deltaY != 0) {
      this._smallestDeltaY = deltaY;
    }

    deltaY = Math.floor(deltaY / this._smallestDeltaY);
    const magnitude = Math.min(deltaY, this._scrollMagnitude);
    const mask = 1 << button;

    // Симулируем нажатие и отпускание кнопки
    for (let i = 0; i < 2; i++) {
      if (i === 0) {
        this.buttonMask |= mask;
      } else {
        this.buttonMask &= ~mask;
      }
      const toks = [
        mtype,
        this.x,
        this.y,
        this.buttonMask,
        magnitude
      ];
      this.send(toks.join(","));
    }

    event.preventDefault();
  };

  /**
   * Захватывает контекстное меню мыши (правый клик) и предотвращает распространение события
   */
  private contextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /**
   * Захватывает события клавиатуры для обнаружения нажатия CTRL-SHIFT горячих клавиш
   */
  private key = (event: KeyboardEvent): void => {
    // Отключаем проблемные горячие клавиши браузера
    if ((event.code === 'F5' && event.ctrlKey) ||
      (event.code === 'KeyI' && event.ctrlKey && event.shiftKey) ||
      (event.code === 'F11')) {
      event.preventDefault();
      return;
    }

    // Захватываем горячую клавишу меню
    if (event.type === 'keydown' && event.code === 'KeyM' && event.ctrlKey && event.shiftKey) {
      if (document.fullscreenElement === null && this.callbacks.onmenuhotkey) {
        this.callbacks.onmenuhotkey();
        event.preventDefault();
      }
      return;
    }

    // Захватываем горячую клавишу полноэкранного режима
    if (event.type === 'keydown' && event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
      if (document.fullscreenElement === null && this.callbacks.onfullscreenhotkey) {
        this.callbacks.onfullscreenhotkey();
        event.preventDefault();
      }
      return;
    }
  };

  /**
   * Отправляет команду WebRTC приложению для переключения отображения удаленного указателя мыши
   */
  private pointerLock = (): void => {
    if (document.pointerLockElement !== null) {
      this.send("p,1");
      console.log("remote pointer visibility to: True");
    } else {
      this.send("p,0");
      console.log("remote pointer visibility to: False");
    }
  };

  /**
   * Отправляет команду WebRTC приложению для скрытия удаленного указателя при выходе из pointer lock
   */
  private exitPointerLock = (): void => {
    document.exitPointerLock();
    this.send("p,0");
    console.log("remote pointer visibility to: False");
  };

  /**
   * Захватывает размеры дисплея и видео, необходимые для вычисления позиции указателя мыши
   */
  private windowMath = (): void => {
    const windowW = this.element.offsetWidth;
    const windowH = this.element.offsetHeight;
    const frameW = this.element.videoWidth;
    const frameH = this.element.videoHeight;

    const multi = Math.min(windowW / frameW, windowH / frameH);
    const vpWidth = frameW * multi;
    const vpHeight = (frameH * multi);

    this.m = {
      mouseMultiX: frameW / vpWidth,
      mouseMultiY: frameH / vpHeight,
      mouseOffsetX: Math.max((windowW - vpWidth) / 2.0, 0),
      mouseOffsetY: Math.max((windowH - vpHeight) / 2.0, 0),
      centerOffsetX: 0,
      centerOffsetY: 0,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      frameW,
      frameH,
    };
  };

  /**
   * Переводит позицию указателя X на основе текущей математики окна
   */
  private clientToServerX(clientX: number): number {
    if (!this.m) return 0;
    let serverX = Math.round((clientX - this.m.mouseOffsetX - this.m.centerOffsetX + this.m.scrollX) * this.m.mouseMultiX);

    if (serverX === this.m.frameW - 1) serverX = this.m.frameW;
    if (serverX > this.m.frameW) serverX = this.m.frameW;
    if (serverX < 0) serverX = 0;

    return serverX;
  }

  /**
   * Переводит позицию указателя Y на основе текущей математики окна
   */
  private clientToServerY(clientY: number): number {
    if (!this.m) return 0;
    let serverY = Math.round((clientY - this.m.mouseOffsetY - this.m.centerOffsetY + this.m.scrollY) * this.m.mouseMultiY);

    if (serverY === this.m.frameH - 1) serverY = this.m.frameH;
    if (serverY > this.m.frameH) serverY = this.m.frameH;
    if (serverY < 0) serverY = 0;

    return serverY;
  }

  /**
   * Отправляет команду WebRTC приложению для подключения виртуального джойстика и инициализирует локальный GamepadManager
   */
  private gamepadConnected = (event: GamepadEvent): void => {
    console.log(`Gamepad connected at index ${event.gamepad.index}: ${event.gamepad.id}. ${event.gamepad.buttons.length} buttons, ${event.gamepad.axes.length} axes.`);

    if (this.callbacks.ongamepadconnected) {
      this.callbacks.ongamepadconnected(event.gamepad.id);
    }

    this.gamepadManager = new GamepadManager(
      event.gamepad,
      this.gamepadButton.bind(this),
      this.gamepadAxis.bind(this)
    );

    this.send(`js,c,${event.gamepad.index},${btoa(event.gamepad.id)},${this.gamepadManager.numAxes},${this.gamepadManager.numButtons}`);
  };

  /**
   * Отправляет команду отключения джойстика в WebRTC приложение
   */
  private gamepadDisconnect = (event: GamepadEvent): void => {
    console.log(`Gamepad ${event.gamepad.index} disconnected`);

    if (this.callbacks.ongamepaddisconnected) {
      this.callbacks.ongamepaddisconnected();
    }

    if (this.gamepadManager) {
      this.gamepadManager.destroy();
      this.gamepadManager = null;
    }

    this.send(`js,d,${event.gamepad.index}`);
  };

  /**
   * Отправляет кнопку геймпада в WebRTC приложение
   */
  private gamepadButton(gp_num: number, btn_num: number, val: number): void {
    this.send(`js,b,${gp_num},${btn_num},${val}`);
  }

  /**
   * Отправляет ось геймпада в WebRTC приложение
   */
  private gamepadAxis(gp_num: number, axis_num: number, val: number): void {
    this.send(`js,a,${gp_num},${axis_num},${val}`);
  }

  /**
   * Когда включается полноэкранный режим, запрашивает блокировку клавиатуры и указателя
   */
  private onFullscreenChange = (): void => {
    if (document.fullscreenElement !== null) {
      if (document.pointerLockElement === null) {
        this.element.requestPointerLock().then(
          () => {
            console.log("pointer lock success");
          }
        ).catch(
          (e) => {
            console.log("pointer lock failed: ", e);
          }
        );
      }
      this.requestKeyboardLock();
    }
    // Сбрасываем локальную клавиатуру
    if (this.keyboard !== null) {
      this.keyboard.reset();
    }
    // Сбрасываем застрявшие клавиши на стороне сервера
    this.send("kr");
  };

  /**
   * Вызывается когда окно изменяет размер, используется для обнаружения когда изменение размера заканчивается
   */
  private resizeStart = (): void => {
    this._rtime = new Date();
    if (this._rtimeout === false) {
      this._rtimeout = true;
      setTimeout(() => { this.resizeEnd(); }, this._rdelta);
    }
  };

  /**
   * Вызывается в setTimeout цикле для обнаружения если изменение размера окна завершено
   */
  private resizeEnd = (): void => {
    if (this._rtime && new Date().getTime() - this._rtime.getTime() < this._rdelta) {
      setTimeout(() => { this.resizeEnd(); }, this._rdelta);
    } else {
      this._rtimeout = false;
      if (this.callbacks.onresizeend) {
        this.callbacks.onresizeend();
      }
    }
  };

  /**
   * Прикрепляет обработчики событий ввода к document, window и element
   */
  attach(): void {
    this.addListener(this.element, 'resize', this.windowMath);
    this.addListener(document, 'pointerlockchange', this.pointerLock);
    this.addListener(this.element.parentElement!, 'fullscreenchange', this.onFullscreenChange);
    this.addListener(window, 'resize', this.windowMath);
    this.addListener(window, 'resize', this.resizeStart);

    // Поддержка геймпада
    this.addListener(window, 'gamepadconnected', this.gamepadConnected);
    this.addListener(window, 'gamepaddisconnected', this.gamepadDisconnect);

    // Корректировка для scroll offset
    this.addListener(window, 'scroll', () => {
      if (this.m) {
        this.m.scrollX = window.scrollX;
        this.m.scrollY = window.scrollY;
      }
    });

    this.attach_context();
  }

  attach_context(): void {
    this.addListenerContext(this.element, 'wheel', this.mouseWheelWrapper);
    this.addListenerContext(this.element, 'contextmenu', this.contextMenu);
    this.addListenerContext(window, 'keydown', this.key);
    this.addListenerContext(window, 'keyup', this.key);

    if ('ontouchstart' in window) {
      this.addListenerContext(window, 'touchstart', this.touch);
      this.addListenerContext(this.element, 'touchend', this.touch);
      this.addListenerContext(this.element, 'touchmove', this.touch);

      console.log("Enabling mouse pointer display for touch devices.");
      this.send("p,1");
      console.log("remote pointer visibility to: True");
    } else {
      this.addListenerContext(this.element, 'mousemove', this.mouseButtonMovement);
      this.addListenerContext(this.element, 'mousedown', this.mouseButtonMovement);
      this.addListenerContext(this.element, 'mouseup', this.mouseButtonMovement);
    }

    // Используем простую клавиатуру
    this.keyboard = new SimpleKeyboard(window);
    this.keyboard.onkeydown = (keysym) => {
      this.send("kd," + keysym);
    };
    this.keyboard.onkeyup = (keysym) => {
      this.send("ku," + keysym);
    };

    if (document.fullscreenElement !== null && document.pointerLockElement === null) {
      this.element.requestPointerLock().then(
        () => {
          console.log("pointer lock success");
        }
      ).catch(
        (e) => {
          console.log("pointer lock failed: ", e);
        }
      );
    }

    this.windowMath();
  }

  detach(): void {
    this.removeListeners(this.listeners);
    this.detach_context();
  }

  detach_context(): void {
    this.removeListeners(this.listeners_context);

    if (this.keyboard) {
      this.keyboard.onkeydown = null;
      this.keyboard.onkeyup = null;
      this.keyboard.reset();
      this.keyboard.destroy();
      this.keyboard = null;
      this.send("kr");
    }

    this.exitPointerLock();
  }

  enterFullscreen(): void {
    if (document.pointerLockElement === null) {
      this.element.requestPointerLock().then(
        () => {
          console.log("pointer lock success");
        }
      ).catch(
        (e) => {
          console.log("pointer lock failed: ", e);
        }
      );
    }
    if (document.fullscreenElement === null) {
      this.element.parentElement!.requestFullscreen().then(
        () => {
          console.log("fullscreen success");
        }
      ).catch(
        (e) => {
          console.log("fullscreen failed: ", e);
        }
      );
    }
  }

  /**
   * Запрашивает блокировку клавиатуры, должен быть в полноэкранном режиме для работы
   */
  requestKeyboardLock(): void {
    if ('keyboard' in navigator && 'lock' in (navigator as any).keyboard) {
      const keys = [
        "AltLeft",
        "AltRight",
        "Tab",
        "Escape",
        "ContextMenu",
        "MetaLeft",
        "MetaRight"
      ];
      console.log("requesting keyboard lock");
      (navigator as any).keyboard.lock(keys).then(
        () => {
          console.log("keyboard lock success");
        }
      ).catch(
        (e: any) => {
          console.log("keyboard lock failed: ", e);
        }
      );
    }
  }

  getWindowResolution(): [number, number] {
    return [
      parseInt(String((() => {
        const offsetRatioWidth = document.body.offsetWidth * window.devicePixelRatio;
        return offsetRatioWidth - offsetRatioWidth % 2;
      })())),
      parseInt(String((() => {
        const offsetRatioHeight = document.body.offsetHeight * window.devicePixelRatio;
        return offsetRatioHeight - offsetRatioHeight % 2;
      })()))
    ];
  }

  private addListener(target: EventTarget, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    this.listeners.push([target, event, handler]);
  }

  private addListenerContext(target: EventTarget, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    this.listeners_context.push([target, event, handler]);
  }

  private removeListeners(listeners: Listener[]): void {
    listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
  }
}


