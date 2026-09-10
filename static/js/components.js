const changeColorComponent = {
  init() {
    const container = document.getElementById('container')

    // custom texture variables
    const customImg = 'assets/textures/candy.jpg'  // try assets/textures/space.jpg!
    const texture = new THREE.TextureLoader().load(customImg)
    this.offset = 0
    this.textureSelected = false

    // These hex colors are used by the UI buttons and car
    // default: white, dark blue, orange, blue, custom texture
    const colorList = ['#FFF', '#091F40', '#FF4713', '#43BBD1', 'custom-texture']

    // Named the specified mesh within the 3D model 'Car' (The mesh for the cars exterior/paint)
    const setColor = ({newColor, button}) => {
      this.modelMesh = this.el.getObject3D('mesh').getObjectByName('Car')
      if (newColor === 'custom-texture') {
        // sets custom texture
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(8, 8)
        this.modelMesh.material.map = texture
        this.modelMesh.material.needsUpdate = true
        this.modelMesh.traverse((node) => {
          node.material.color = new THREE.Color('#FFF')
        })
        this.textureSelected = true
      } else {
        // no custom texture
        this.modelMesh.material.map = null
        this.modelMesh.material.needsUpdate = true
        this.modelMesh.traverse((node) => {
          node.material.color = new THREE.Color(newColor)
        })
        this.textureSelected = false
      }

      button.focus()
    }

    // create a UI button for each color in the list that changes the car color
    for (let i = 0; i < colorList.length; i++) {
      const colorButton = document.createElement('button')
      colorButton.classList.add('carousel')
      if (colorList[i] === 'custom-texture') {
        // sets button background to custom texture
        colorButton.style.backgroundImage = `url(${customImg})`
      } else {
        // sets button background to hex color
        colorButton.style.backgroundColor = colorList[i]
      }
      container.appendChild(colorButton)

      colorButton.addEventListener('click', () => setColor({
        newColor: colorList[i],
        button: colorButton,
      }))
    }

    this.el.sceneEl.addEventListener('realityready', () => {
      // Select first button in list
      const firstButton = container.getElementsByTagName('button')[0]
      // set car to first button's color
      setColor({newColor: colorList[0], button: firstButton})
    })

    // support horizontal scroll for more than 5 colors
    if (colorList.length > 5) {
      container.style.pointerEvents = 'auto'
    }
  },
  tick() {
    if (this.textureSelected === false) {
      return
    }
    // animates texture if selected
    this.modelMesh.getObjectByName('Car').material.map.repeat.x = 2
    this.modelMesh.getObjectByName('Car').material.map.repeat.y = 2
    this.modelMesh.getObjectByName('Car').material.map.offset.x = this.offset
    this.offset += 0.002
  },
}

const annotationComponent = {
  schema: {
    text: {default: 'text here'},  // text label displays
    labeldistance: {default: 1},   // distance to element before label appears
    hsdistance: {default: 2.85},   // distance to element before hotspot appears
    offsetY: {default: 0.1},       // y offset of label
  },
  init() {
    this.camera = this.el.sceneEl.camera
    this.scene = new THREE.Scene()

    this.labelActivated = false
    this.hsActivated = false
    this.autoDismissTimer = null
    this.labelManuallyActivated = false  // click으로 열린 경우 tick proximity 간섭 차단용
    this._hotspotJustClicked = false     // 씬 터치 핸들러와의 충돌 방지용

    // hotspot inner - 초기 opacity 0
    this.el.setAttribute('radius', 0.03)
    this.el.setAttribute('material', {shader: 'flat', color: '#FF4713', alphaTest: 0.5, transparent: true, opacity: 0})
    this.el.setAttribute('segments-height', 12)
    this.el.setAttribute('segments-width', 12)

    // hotspot torus - 초기 opacity 0
    this.torus = document.createElement('a-torus')
    this.torus.setAttribute('material', {shader: 'flat', color: '#FF4713', alphaTest: 0.5, transparent: true, opacity: 0})
    this.torus.setAttribute('radius', 0.05)
    this.torus.setAttribute('segments-radial', 12)
    this.torus.setAttribute('segments-tubular', 24)
    this.torus.setAttribute('radius-tubular', 0.005)
    this.torus.setAttribute('xrextras-spin', '')
    this.el.appendChild(this.torus)

    this.activateLabel = () => {
      if (this.labelActivated) return
      // hide hotspot torus
      this.torus.setAttribute('animation__scale', {
        property: 'scale',
        from: '1 1 1',
        to: '0.001 0.001 0.001',
        easing: 'easeInOutQuad',
        dur: 250,
      })
      // brighten hotspot inner
      this.el.setAttribute('color', '#FD835E')
      // show text label
      this.label.style.opacity = 0
      this.label.style.display = 'block'
      this.label.classList.add('fade-in')
      setTimeout(() => {
        this.label.style.opacity = 1
        this.label.classList.remove('fade-in')
      }, 500)
      this.labelActivated = true
    }

    this.deactivateLabel = () => {
      if (!this.labelActivated) return
      // show hotspot torus
      this.torus.setAttribute('animation__scale', {
        property: 'scale',
        from: '0.001 0.001 0.001',
        to: '1 1 1',
        easing: 'easeOutElastic',
        dur: 500,
      })
      // revert to original hotspot inner color
      this.el.setAttribute('color', '#FF4713')
      // hide text label
      this.label.style.opacity = 1
      this.label.classList.add('fade-out')
      setTimeout(() => {
        this.label.style.opacity = 0
        this.label.classList.remove('fade-out')
        this.label.style.display = 'none'
      }, 400)
      this.labelActivated = false
      this.labelManuallyActivated = false  // 수동 활성 플래그 해제
    }

    // show hotspot
    this.activateHs = () => {
      if (this.hsActivated) return
      this.el.setAttribute('animation__fading', {
        property: 'opacity', from: 0, to: 1, easing: 'easeInOutQuad', dur: 1000,
      })
      this.torus.setAttribute('animation__fade', {
        property: 'opacity', from: 0, to: 1, easing: 'easeInOutQuad', dur: 1000,
      })
      this.hsActivated = true
    }

    // hide hotspot
    this.deactivateHs = () => {
      if (!this.hsActivated) return
      this.el.setAttribute('animation__fading', {
        property: 'opacity', from: 1, to: 0, easing: 'easeInOutQuad', dur: 1000,
      })
      this.torus.setAttribute('animation__fade', {
        property: 'opacity', from: 1, to: 0, easing: 'easeInOutQuad', dur: 1000,
      })
      this.hsActivated = false
    }

    // 3초 자동 닫힘 타이머
    this.startAutoDismiss = () => {
      clearTimeout(this.autoDismissTimer)
      this.autoDismissTimer = setTimeout(() => {
        this.labelManuallyActivated = false
        this.deactivateLabel()
      }, 3000)
    }

    // hotspot 클릭 핸들러
    // A-Frame click은 touchend 이후 synthetic으로 발생하므로
    // _hotspotJustClicked를 여기서 set하면 document touchend 핸들러(200ms delay)가 무시 가능
    this.el.addEventListener('click', () => {
      this._hotspotJustClicked = true
      setTimeout(() => { this._hotspotJustClicked = false }, 300)

      if (this.labelActivated) {
        // 이미 열려있으면 닫기
        clearTimeout(this.autoDismissTimer)
        this.labelManuallyActivated = false
        this.deactivateLabel()
      } else {
        // 다른 hotspot label 먼저 닫기
        document.querySelectorAll('[annotation]').forEach(otherEl => {
          if (otherEl !== this.el && otherEl.components && otherEl.components.annotation) {
            clearTimeout(otherEl.components.annotation.autoDismissTimer)
            otherEl.components.annotation.labelManuallyActivated = false
            otherEl.components.annotation.deactivateLabel()
          }
        })
        this.labelManuallyActivated = true  // tick proximity 간섭 차단
        this.activateLabel()
        this.startAutoDismiss()
      }
    })

    // 빈 공간 터치 감지: touchend + 200ms delay로 A-Frame click 이후에 처리
    // (touchstart/click은 A-Frame click보다 먼저 발생하여 플래그 체크 불가)
    this.onSceneTouch = () => {
      setTimeout(() => {
        if (this._hotspotJustClicked) return  // hotspot 클릭이면 무시
        clearTimeout(this.autoDismissTimer)
        this.labelManuallyActivated = false
        this.deactivateLabel()
      }, 200)
    }
    document.addEventListener('touchend', this.onSceneTouch)
    document.addEventListener('mouseup', this.onSceneTouch)  // 데스크톱 대응

    // create label renderer for text
    this.labelRenderer = new THREE.CSS2DRenderer()
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight)
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.top = '0px'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    document.body.appendChild(this.labelRenderer.domElement)

    // create label
    this.label = document.createElement('h1')
    this.label.style.color = 'white'
    this.label.style.opacity = 0
    this.label.style.display = 'none'
    this.label.style.fontFamily = '\'Nunito\', sans-serif'
    this.label.style.fontWeight = 'bold'
    this.label.style.fontSize = '1.3em'
    this.label.style.textShadow = 'rgb(0 0 0 / 50%) 0px 0px 6px'
    this.label.innerText = this.data.text
    document.body.appendChild(this.label)

    // set label position to hotspot
    this.labelObj = new THREE.CSS2DObject(this.label)
    this.worldVec = new THREE.Vector3()
    this.worldPos = this.el.object3D.getWorldPosition(this.worldVec)
    this.labelObj.position.copy(new THREE.Vector3(this.worldPos.x, this.worldPos.y + this.data.offsetY, this.worldPos.z))
    this.scene.add(this.labelObj)
  },

  remove() {
    clearTimeout(this.autoDismissTimer)
    document.removeEventListener('touchend', this.onSceneTouch)
    document.removeEventListener('mouseup', this.onSceneTouch)
  },

  tick() {
    // hotspot-group이 숨겨진 상태면 전부 초기화
    const group = this.el.parentNode
    if (group && !group.object3D.visible) {
      if (this.hsActivated || this.labelActivated) {
        clearTimeout(this.autoDismissTimer)
        this.el.removeAttribute('animation__fading')
        this.torus.removeAttribute('animation__fade')
        if (this.el.components.material) this.el.components.material.material.opacity = 0
        if (this.torus.components.material) this.torus.components.material.material.opacity = 0
        this.label.style.display = 'none'
        this.label.style.opacity = 0
        this.hsActivated = false
        this.labelActivated = false
        this.labelManuallyActivated = false
      }
      return
    }

    // track label position to hotspot
    this.worldPos = this.el.object3D.getWorldPosition(this.worldVec)
    this.labelObj.position.copy(new THREE.Vector3(this.worldPos.x, this.worldPos.y + this.data.offsetY, this.worldPos.z))
    this.labelRenderer.render(this.scene, this.camera)

    const distance = this.worldPos.distanceTo(this.camera.el.object3D.position)

    // label proximity: 수동 활성 상태(labelManuallyActivated)면 tick이 닫지 않음
    if (!this.labelManuallyActivated) {
      if (distance < this.data.labeldistance) {
        this.activateLabel()
      } else {
        this.deactivateLabel()
      }
    }

    // hotspot sphere proximity
    if (distance < this.data.hsdistance) {
      this.activateHs()
    } else {
      this.deactivateHs()
    }
  },
}

const targets = ['Front-Driver', 'Back-Driver', 'Front-Pass', 'Back-Pass']
const proximityComponent = {
  schema: {
    target: {type: 'string', default: 'camera'},  // id of the object to check proximity on
    distance: {type: 'number', default: 3.5},  // distance to object
  },
  init() {
    let windowsActivated
    this.activateWindows = () => {
      if (windowsActivated) {
        return
      }

      // roll down windows
      targets.forEach((target) => {
        this.el.setAttribute(`gltf-morph__${target}`, `morphtarget: ${target}; value: 1`)
        this.el.setAttribute(`animation__${target}`, `
          property: gltf-morph__${target}.value;
          from: 0;
          to: 1;
          easing: easeInOutQuad`)
      })

      windowsActivated = true
    }

    this.deactivateWindows = () => {
      if (!windowsActivated) {
        return
      }

      // roll up windows
      targets.forEach((target) => {
        this.el.setAttribute(`gltf-morph__${target}`, `morphtarget: ${target}; value: 0`)
        this.el.setAttribute(`animation__${target}`, `
          property: gltf-morph__${target}.value;
          from: 1;
          to: 0;
          easing: easeInOutQuad`)
      })

      windowsActivated = false
    }
  },
  tick() {
    const thisPosition = this.el.object3D.position
    const targetPosition = document.getElementById(this.data.target).object3D.position
    const distance = thisPosition.distanceTo(targetPosition)

    // proximity monitoring
    if (distance < this.data.distance) {
      this.activateWindows()
    } else {
      this.deactivateWindows()
    }
  },
}

const absPinchScaleComponent = {
  schema: {
    min: {default: 0.1},
    max: {default: 5},
    scale: {default: 0},  // If scale is set to zero here, the object's initial scale is used.
  },
  init() {
    const s = this.data.scale
    this.initialScale = (s && {x: s, y: s, z: s}) || this.el.object3D.scale.clone()
    this.scaleFactor = 1
    this.handleEvent = this.handleEvent.bind(this)
    this.el.sceneEl.addEventListener('twofingermove', this.handleEvent)
    this.el.classList.add('cantap')  // Needs "objects: .cantap" attribute on raycaster.

    // Calculate glb-model bounding box
    this.calcMeshBounds = () => {
      this.meshBounds = new THREE.Box3().setFromObject(this.el.object3D)
      this.lengthMeshBounds = {
        x: Math.abs(this.meshBounds.max.x - this.meshBounds.min.x),
        y: Math.abs(this.meshBounds.max.y - this.meshBounds.min.y),
        z: Math.abs(this.meshBounds.max.z - this.meshBounds.min.z),
      }
    }
    this.calcMeshBounds()

    // UI LOGIC
    this.camera = this.el.sceneEl.camera
    this.scene = new THREE.Scene()

    this.labelRenderer = new THREE.CSS2DRenderer()
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight)
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.top = '0px'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    document.body.appendChild(this.labelRenderer.domElement)

    this.label = document.createElement('h1')
    this.label.style.color = 'white'
    this.label.style.fontFamily = '\'Nunito\', sans-serif'
    this.label.style.textShadow = 'rgb(0 0 0 / 50%) 0px 0px 6px'
    this.label.style.fontWeight = 'bold'
    document.body.appendChild(this.label)

    this.labelObj = new THREE.CSS2DObject(this.label)
    this.scene.add(this.labelObj)

    // TIMER LOGIC
    this.runTimer = () => {
      this.timer = window.setTimeout(
        () => {
          this.label.classList.add('fade-out')
          setTimeout(() => {
            this.label.classList.remove('fade-out')
            this.label.style.opacity = 0
          }, 250)
        }, 1000
      )
    }
  },
  tick() {
    this.labelObj.position.copy(new THREE.Vector3(this.el.object3D.position.x, this.lengthMeshBounds.y + 0.3, this.el.object3D.position.z))
    this.labelRenderer.render(this.scene, this.camera)
  },
  remove() {
    this.el.sceneEl.removeEventListener('twofingermove', this.handleEvent)
  },
  handleEvent(event) {
    // Calculate glb-model bounding box
    this.calcMeshBounds()

    this.scaleFactor *= 1 + event.detail.spreadChange / event.detail.startSpread
    this.scaleFactor = Math.min(Math.max(this.scaleFactor, this.data.min), this.data.max)

    const setText = () => {
      // change % text
      const processedSF = (this.scaleFactor * 100).toFixed()
      this.label.innerText = `${processedSF}%`
    }

    if (this.scaleFactor <= 0.9 || this.scaleFactor >= 1.1) {
      // scale object
      this.el.object3D.scale.x = this.scaleFactor * this.initialScale.x
      this.el.object3D.scale.y = this.scaleFactor * this.initialScale.y
      this.el.object3D.scale.z = this.scaleFactor * this.initialScale.z

      // change % text
      setText()
    } else if (this.scaleFactor >= 0.9 && this.scaleFactor <= 1.1) {  // snapping between 90 - 100 - 110
      this.el.object3D.scale.x = this.initialScale.x
      this.el.object3D.scale.y = this.initialScale.y
      this.el.object3D.scale.z = this.initialScale.z
      this.label.innerText = '100%'
    }

    // fade out behavior
    this.label.style.opacity = 1
    clearTimeout(this.timer)
    this.runTimer()
  },
}

const gltfMorphComponent = {
  multiple: true,
  schema: {
    morphtarget: {type: 'string', default: ''},
    value: {type: 'number', default: 0},
  },
  init() {
    this.el.addEventListener('object3dset', () => {
      this.morpher()
    })
  },
  update() {
    this.morpher()
  },
  morpher() {
    const mesh = this.el.object3D
    mesh.traverse((o) => {
      if (o.morphTargetInfluences && o.userData.targetNames) {
        const pos = o.userData.targetNames.indexOf(this.data.morphtarget)
        o.morphTargetInfluences[pos] = this.data.value
      }
    })
  },
}

const shortCircutRaycast = (obj3d) => {
  obj3d.traverse((node) => {
    node.raycast = () => {}
  })
}

const ignoreRaycast = {
  init() {
    const {object3D} = this.el
    const clearRaycast = (e) => {
      shortCircutRaycast(object3D)
      this.el.removeEventListener(e.type, clearRaycast)
    }
    if (this.el.getObject3D('mesh')) {
      clearRaycast('loaded')
    }
    this.el.addEventListener('model-loaded', clearRaycast)
    this.el.addEventListener('loaded', clearRaycast)
    this.el.addEventListener('child-attached', clearRaycast)
  },
}

export {changeColorComponent, annotationComponent, absPinchScaleComponent, proximityComponent, gltfMorphComponent, ignoreRaycast}
