const ArrowKeys = {
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;

// Frog movement
const MAX_SPEED = 15;
const ACC = 0.5;
const BACK_ACC = 0.5;

// Waves
const WAVE_COUNT = 50;
let WAVE_DX = -2;
let WAVE_DY =  2;

window.game = (() => {
  let lib = null;
  let stage = null;
  let createjs = null;

  let waves = [];
  let isInited = false;

  // frog velocity
  let vx = 0;
  let vy = 0;

  // keyboard state
  let keys = {};
  let lipsInstance = {};
  const gameObjects = [];
  let currentScore = 0;
  let gameOver = false;

  // touch stick (mobile)
  const STICK_RADIUS = 260;
  const STICK_CENTER_X = 130.85;
  const STICK_CENTER_Y = 130.1;
  let stickActive = false;
  let stickTouchId = null;
  let stickBaseX = 0;
  let stickBaseY = 0;
  let stickInputX = 0;
  let stickInputY = 0;

  const tsongedObjects = {
    belka: 0,
    pol: 0,
    alex: 0,
    mir: 0,
    bottle: 0,
  }

  const isMobile = () => {
    const ua = navigator.userAgent || "";
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
    const narrow = window.innerWidth <= 1024;
    const hasTouch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
    return mobileUA || (hasTouch && narrow);
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const approachZero = (v, amount) => {
    if (v > 0) return Math.max(0, v - amount);
    if (v < 0) return Math.min(0, v + amount);
    return 0;
  };

  const limitSpeed = (vx, vy, max) => {
    const sp = Math.hypot(vx, vy);
    if (sp > max) {
      const k = max / sp;
      return { vx: vx * k, vy: vy * k };
    }
    return { vx, vy };
  };

  // ---------- Waves helpers ----------
  const initWave = (w) => {
    // layer 0..1: ближе = крупнее/ярче/быстрее
    const layer = 0.2;

    w.scaleX = w.scaleY = 0.55 + layer * 0.75;
    w.alpha = 0.12 + layer * 0.35;

    // индивидуальная скорость (параллакс)
    w._vx = WAVE_DX * (0.6 + layer * 0.9);
    w._vy = WAVE_DY * (0.6 + layer * 0.9);

    // покачивание
    w._bobA = 0.6 + Math.random() * 1.8;     // амплитуда
    w._bobS = 0.010 + Math.random() * 0.020; // скорость синуса
    w._bobP = Math.random() * Math.PI * 2;   // фаза
    w._baseY = w.y;

    // w.rotation = -6 + Math.random() * 12;
  };

  const respawnWaveTopRightBand = (w, margin) => {
    // спавн из "пояса" сверху/справа, чтобы не было видно "точку-источник"
    const fromTop = Math.random() < 0.55;

    if (fromTop) {
      w.x = Math.random() * (SCENE_WIDTH + margin) + margin * 0.5;
      w.y = -margin - Math.random() * margin;
    } else {
      w.x = SCENE_WIDTH + margin + Math.random() * margin;
      w.y = Math.random() * (SCENE_HEIGHT * 0.75);
    }

    initWave(w);
  };
  let musicStarted = false;

  const resizeCanvas = () => {

    const canvas = document.querySelector('canvas');

    const w = SCENE_WIDTH;
    const h = SCENE_HEIGHT;

    const iw = window.innerWidth;
    const ih = window.innerHeight;

    const scale = Math.min(iw / w, ih / h);

    canvas.style.width = w * scale + "px";
    canvas.style.height = h * scale + "px";

    canvas.style.position = "absolute";
    canvas.style.left = (iw - w * scale) / 2 + "px";
    canvas.style.top  = (ih - h * scale) / 2 + "px";
  };

  // client coords -> stage (exportRoot) coords 0..SCENE_WIDTH, 0..SCENE_HEIGHT
  const clientToStage = (clientX, clientY) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = SCENE_WIDTH / rect.width;
    const scaleY = SCENE_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  window.addEventListener("load", (event) => {
    resizeCanvas();
  });


  // ---------- Public ----------
  const init = (s, l, c) => {
    lib = l;
    stage = s;
    createjs = c;

    stage.on("tick", handleTick);

    window.addEventListener(
      "keydown",
      (e) => {
        keys[e.code] = true;
        if (e.code.startsWith("Arrow")) e.preventDefault();
        if(!musicStarted) {
          gameObjects.push(stage.belka);
          startMusic();
          lipsInstance = createjs.Sound.play("lips", {
            loop: -1,
            volume: 0.6
          });
          const tutorialToHide = isMobile() && stage.tutorial_touch ? stage.tutorial_touch : stage.tutorial;
          if (tutorialToHide) {
            createjs.Tween.get(tutorialToHide)
              .to(
                { alpha: 0 },
                800,
                createjs.Ease.quadOut
              );
          }
          musicStarted = true;
        }

      },
      { passive: false }
    );

    window.addEventListener(
      "keyup",
      (e) => {
        keys[e.code] = false;
        if (e.code.startsWith("Arrow")) e.preventDefault();
      },
      { passive: false }
    );

    // touch stick (mobile)
    if (isMobile() && stage.stick) {
      const canvas = document.querySelector('canvas');
      const onTouchStart = (e) => {
        if (stickActive || !e.changedTouches || !e.changedTouches.length) return;
        const t = e.changedTouches[0];
        const p = clientToStage(t.clientX, t.clientY);
        stickTouchId = t.identifier;
        stickBaseX = p.x;
        stickBaseY = p.y;
        stickActive = true;
        stage.stick.x = stickBaseX;
        stage.stick.y = stickBaseY;
        stage.stick.visible = true;
        stage.setChildIndex(stage.stick, stage.numChildren - 1);
        stage.stick.circle.x = STICK_CENTER_X;
        stage.stick.circle.y = STICK_CENTER_Y;
        stickInputX = 0;
        stickInputY = 0;
        if (!musicStarted) {
          gameObjects.push(stage.belka);
          startMusic();
          lipsInstance = createjs.Sound.play("lips", { loop: -1, volume: 0.6 });
          if (stage.tutorial_touch) {
            createjs.Tween.get(stage.tutorial_touch).to({ alpha: 0 }, 800, createjs.Ease.quadOut);
          }
          musicStarted = true;
        }
      };
      const onTouchMove = (e) => {
        if (!stickActive || stickTouchId == null) return;
        const t = Array.from(e.changedTouches).find((x) => x.identifier === stickTouchId);
        if (!t) return;
        e.preventDefault();
        const p = clientToStage(t.clientX, t.clientY);
        let dx = p.x - stickBaseX;
        let dy = p.y - stickBaseY;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) {
          const k = STICK_RADIUS / len;
          dx *= k;
          dy *= k;
        }
        stage.stick.circle.x = STICK_CENTER_X + dx;
        stage.stick.circle.y = STICK_CENTER_Y + dy;
        stickInputX = len > 0 ? dx / STICK_RADIUS : 0;
        stickInputY = len > 0 ? dy / STICK_RADIUS : 0;
      };
      const onTouchEnd = (e) => {
        const t = Array.from(e.changedTouches).find((x) => x.identifier === stickTouchId);
        if (t || e.touches.length === 0) {
          stickActive = false;
          stickTouchId = null;
          stickInputX = 0;
          stickInputY = 0;
          stage.stick.visible = false;
          stage.stick.circle.x = STICK_CENTER_X;
          stage.stick.circle.y = STICK_CENTER_Y;
        }
      };
      canvas.addEventListener("touchstart", onTouchStart, { passive: true });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", onTouchEnd, { passive: true });
      canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });
    }

    spawnWavesRandom(WAVE_COUNT);

    // tutorial: на мобиле показываем tutorial_touch, иначе tutorial
    if (isMobile()) {
      if (stage.tutorial) stage.tutorial.visible = false;
      if (stage.tutorial_touch) stage.tutorial_touch.visible = true;
      if (stage.stick) {
        stage.stick.visible = false;
        stage.stick.circle.x = STICK_CENTER_X;
        stage.stick.circle.y = STICK_CENTER_Y;
      }
    } else {
      if (stage.tutorial_touch) stage.tutorial_touch.visible = false;
      if (stage.tutorial) stage.tutorial.visible = true;
      if (stage.stick) stage.stick.visible = false;
    }

    // гарантируем, что frog поверх волн (если frog уже на сцене)
    if (stage.frog) stage.setChildIndex(stage.frog, stage.numChildren - 1);
    stage.frog.direction = 'right';
    stopLips();
    setScore(0);
    // gameObjects.push(stage.alex);
    // gameObjects.push(stage.pol);
    // gameObjects.push(stage.mir);
    // gameObjects.push(stage.bottle);
    stage.frog.flower.visible = false;
    stage.final_text.visible = false;
    isInited = true;
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  };

  const runFinal = () => {
    stage.score.visible = false;
    stage.frog.flower.visible = false;
    stage.final_text.gotoAndPlay(0);
    stage.final_text.header.gotoAndStop(0);
    stage.final_text.text.gotoAndStop(0);
    stage.final_text.header.visible = false;
    lipsInstance.volume = 0;
    stopLips();
    const coords = {
      belka: {
        x:352 + 120,
        y: 663 + 150,
      },
      pol: {
        x:590 + 120,
        y: 683 + 150,
      },
      alex: {
        x:1344 + 120,
        y: 654 + 150,
      },
      mir: {
        x:1089 + 120,
        y: 655 + 150,
      },
      frog: {
        x:870 + 120,
        y: 675 + 150,
      },
      bottle: {
        x: 2000 + 120,
        y: 800 + 150,
      }
    };
    const objs = [...gameObjects, stage.frog];
    objs.forEach((obj) => {
      if(!obj.isBottle && !(obj.name === 'frog')) {
        obj.gotoAndStop('happy');
      }
      createjs.Tween.get(obj)
        .to(
          coords[obj.name],
          800,
          createjs.Ease.quadOut
        );
      setTimeout(() => {
        createjs.Tween.get(obj, { loop: true })
          .to({ y: obj.y - 5 + Math.random()* 5 }, 500, createjs.Ease.sineInOut)
          .to({ y: obj.y }, 500, createjs.Ease.sineInOut);
      }, 800)
      setTimeout(() => {
        stage.final_text.visible = true;
        stage.final_text.text.gotoAndPlay(0);
      }, 800)

      setTimeout(() => {
        createjs.Sound.play("letters", {volume: 0.3});
      }, 1200)

      setTimeout(() => {
        createjs.Sound.play("header", {volume: 0.3});
        stage.final_text.header.gotoAndPlay(0);
        stage.final_text.header.visible = true;
      }, 1500)
    });
  }

  const setScore = (val) => {
    stage.score.arrow.rotation = val*(180/6) - 90;
    currentScore = val;
    if(currentScore >= 6) {
      gameOver = true;
      runFinal();
    }
  }

  const startMusic = () => {
    createjs.Sound.play("music", {
      loop: -1,
      volume: 0.2
    });
  }

  // ---------- Tick ----------
  const handleTick = (event) => {
    if (!isInited || !stage || !stage.frog || gameOver) return;

    const dt = event && event.delta ? event.delta / 1000 : 1 / 60;
    const k = dt * 60;

    handleArrows(k);
    applyWaterFriction(k);
    moveFrog();

    updateWaves(k);

    handleGameObjects();
    // держим frog поверх волн
    sortDepth();
    if(currentScore > 0) {
      setScore(currentScore - 0.01)
    }
  };

  const sortDepth = () => {
    const toSort = [...gameObjects, stage.frog];
    toSort.sort((a, b) => {
      if (a.y < b.y) {
        return -1;
      } else {
        return 1;
      }
      return 0;
    })
    toSort.forEach((obj) => {
      stage.addChild(obj);
    });
    stage.addChild(stage.tsong);
    stage.addChild(stage.score);
  }

  const handleGameObjects = () => {
    const t = createjs.Ticker.getTime();
    gameObjects.forEach((obj) => {
      if(!obj._vx && !obj._vy) {
        obj._vx = -2  + Math.random() * 4;
        obj._vy = 2 + Math.random() * 10;
      }
      obj.x += obj._vx;
      obj.y += obj._vy;
      if(obj.name ==='pol') {
        console.log('obj._vy', obj._vy);
      }

      if(obj.y > SCENE_HEIGHT + 300) {
        obj.y = -100;
        obj.x = 100 + Math.random()* (SCENE_WIDTH - 200);
        obj.gotoAndStop(0);
        obj.tsonged = false;
        obj._vx = -2  + Math.random() * 4;
        obj._vy = 2 + Math.random() * 10;
      }

      if(getDistance(obj, stage.frog) > 310 && obj.tsonged && obj.isMir && obj.isWantFlower) {
        obj.tsonged = false;
      }

      if(getDistance(obj, stage.frog) < 300 && !obj.tsonged) {
        obj.tsonged = true;
        tsongedObjects[obj.name] += 1;
        stage.tsong.x = stage.frog.x;
        stage.tsong.y = stage.frog.y - 135;
        stage.tsong.gotoAndPlay(1);

        if(!obj.isBottle) {
          createjs.Sound.play("tsong");
        } else {
          createjs.Sound.play("got_flower");
          stage.frog.flower.visible = true;
          stage.frog.hasFlower = true;
        }
        if(obj.isWantFlower && stage.frog.hasFlower) {
          obj.isWantFlower = false;
        }

        setTimeout(() => {
          if(!obj.isWantFlower && !obj.isBottle) {
            createjs.Sound.play("add_score");
            if(obj.isMir) {
              stage.frog.flower.visible = false;
              stage.frog.hasFlower = false;
            }


          }
          if(obj.isWantFlower) {
            createjs.Sound.play("want_flower");
          }

        }, 100);
        if(!obj.isWantFlower) {
          if(!obj.isBottle) {
            if(obj.isMir) {
              setScore(currentScore + 2);
            } else {
              setScore(currentScore + 1);
            }

          }
        } else {
          setScore(currentScore - 1);
        }

        if(obj.isWantFlower) {
          obj.gotoAndStop('want_flower');
        } else {
          obj.gotoAndStop('happy');
        }

        if(obj.name === 'belka' && tsongedObjects.belka === 1) {
          gameObjects.push(stage.pol);
        }
        if(obj.name === 'pol' && tsongedObjects.pol === 1) {
          gameObjects.push(stage.alex);
        }
        if(obj.name === 'alex' && tsongedObjects.alex === 1) {
          gameObjects.push(stage.mir);
        }
        if(obj.name === 'mir' && tsongedObjects.mir === 1) {
          gameObjects.push(stage.bottle);
        }

      }
    });
  }

  // ---------- Frog ----------
  const handleArrows = (k) => {
    let ax =
      (keys[ArrowKeys.ArrowRight] ? 1 : 0) -
      (keys[ArrowKeys.ArrowLeft] ? 1 : 0);
    let ay =
      (keys[ArrowKeys.ArrowDown] ? 1 : 0) -
      (keys[ArrowKeys.ArrowUp] ? 1 : 0);
    if (stickActive) {
      ax += stickInputX;
      ay += stickInputY;
    }

    if (ax !== 0) vx += ax * ACC * k;
    if (ay !== 0) vy += ay * ACC * k;

    const limited = limitSpeed(vx, vy, MAX_SPEED);
    vx = limited.vx;
    vy = limited.vy;
  };

  const applyWaterFriction = (k) => {
    let axPressed = keys[ArrowKeys.ArrowLeft] || keys[ArrowKeys.ArrowRight];
    let ayPressed = keys[ArrowKeys.ArrowUp] || keys[ArrowKeys.ArrowDown];
    if (stickActive) {
      axPressed = axPressed || stickInputX !== 0;
      ayPressed = ayPressed || stickInputY !== 0;
    }

    if (!axPressed) vx = approachZero(vx, BACK_ACC * k);
    if (!ayPressed) vy = approachZero(vy, BACK_ACC * k);
  };

  const moveFrog = () => {
    const t = createjs.Ticker.getTime();
    const frog = stage.frog;

    frog.x += vx;
    frog.y += vy;

    // смена анимации/позы
    const movingRight = keys[ArrowKeys.ArrowRight] || (stickActive && stickInputX > 0.1);
    const movingLeft = keys[ArrowKeys.ArrowLeft] || (stickActive && stickInputX < -0.1);
    if (movingRight) {
      if(frog.direction === 'left') {
        frog.gotoAndStop("left");
        frog.play()
        frog.direction = 'right';
      }
    } else if (movingLeft) {
      if(frog.direction === 'right') {
        frog.gotoAndStop("right");
        frog.play()
        frog.direction = 'left';
      }
    }

    const isMoving = Object.values(keys).some(Boolean) || (stickActive && (Math.abs(stickInputX) > 0.05 || Math.abs(stickInputY) > 0.05));

    if(!isMoving && Math.abs(vy) < 0.1 ) {
      frog.y += Math.sin(t/100);
    }

    updateLipsSound();

    frog.shadow.skewX = vx * 2;
    frog.shadow.scaleY = 1 + vy *  -0.01;

    frog.x = clamp(frog.x, 0, SCENE_WIDTH);
    frog.y = clamp(frog.y, 0, SCENE_HEIGHT);
  };


  const updateLipsSound = () => {
    const isMoving =
      Object.values(keys).some(Boolean) ||
      (stickActive && (Math.abs(stickInputX) > 0.05 || Math.abs(stickInputY) > 0.05));

    if (isMoving) {
      // если уже играет — не запускаем заново
      lipsInstance.volume = 0.6;
      startLips();
    } else {
      lipsInstance.volume = 0;
      stopLips();
    }
  };

  const stopLips = () => {
    if(stage.frog.frog_right) {
      stage.frog.frog_right.lips.stop();
    }

    if(stage.frog.frog_left) {
      stage.frog.frog_left.lips.stop();
    }
  }

  const startLips = () => {
    if(stage.frog.frog_right) {
      stage.frog.frog_right.lips.play();
    }

    if(stage.frog.frog_left) {
      stage.frog.frog_left.lips.play();
    }
  }

  const getDistance = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ---------- Waves ----------
  const spawnWavesRandom = (count = WAVE_COUNT) => {
    for (const w of waves) stage.removeChild(w);
    waves.length = 0;

    for (let i = 0; i < count; i++) {
      const w = new lib.Wave();
      w.x = Math.random() * SCENE_WIDTH;
      w.y = Math.random() * SCENE_HEIGHT;

      initWave(w);

      // волны лучше добавлять "вниз" по слоям
      stage.addChild(w);
      waves.push(w);
    }
  };

  const updateWaves = (k = 1) => {
    const margin = 140;
    const t = createjs.Ticker.getTime();

    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];

      w.x += w._vx * k;
      w._baseY += w._vy * k;

      // синус-покачивание по Y (и чуть-чуть по X)
      w.y = w._baseY + Math.sin(t * w._bobS + w._bobP) * w._bobA;
      w.x += Math.cos(t * (w._bobS * 0.7) + w._bobP) * (w._bobA * 0.15);

      // ушла за сцену влево/вниз — респавним
      if (w.x < -margin || w.y > SCENE_HEIGHT + margin) {
        stage.removeChild(w);
        waves.splice(i, 1);

        const nw = new lib.Wave();
        respawnWaveTopRightBand(nw, margin);

        stage.addChild(nw);
        waves.push(nw);
      }
    }
  };

  return { init };
})();
