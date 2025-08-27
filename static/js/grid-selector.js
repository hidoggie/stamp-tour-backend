/* global AFRAME, THREE */
/**
 * provide visual indicator of intersected grid as a red box "selector" 
 */

AFRAME.registerComponent('grid-selector', {
  init: function () {
    // console.log('init!')
    // Use events to figure out what raycaster is listening so we don't have to
    // hardcode the raycaster.
    this.el.addEventListener('raycaster-intersected', evt => {
      this.raycaster = evt.detail.el;
    });
    this.el.addEventListener('raycaster-intersected-cleared', evt => {
      this.raycaster = null;
    });
    this.helperVector = new THREE.Vector3();

  },

  tick: function () {
    if (!this.raycaster) { return; }  // Not intersecting.

    let intersection = this.raycaster.components.raycaster.getIntersection(this.el);
    if (!intersection) { return; }
    // console.log(intersection.point);

    const selectorEl = document.getElementById("selector");
    selectorEl.setAttribute('position', intersection.point) 
 //   const selector2El = document.getElementById("selector2");
 //   selector2El.setAttribute('position', intersection.point)
    // snap the intersection location to the gridlines
    const _snapper = (originalPosition, offset, snap) => {
      const helperVector = this.helperVector;
      helperVector.copy(originalPosition);
      
      helperVector.x = Math.floor(helperVector.x / snap) * snap + offset;
      helperVector.y = Math.floor(helperVector.y / snap) * snap + offset;
      helperVector.z = Math.floor(helperVector.z / snap) * snap + offset;
      return helperVector;
    }    

    const oldPos = selectorEl.getAttribute("position");
    // console.log(oldPos);
    const newPos = _snapper(oldPos, 0.25, 0.5);
    // console.log(newPos);

    selectorEl.object3D.position.copy(newPos);
  }
});