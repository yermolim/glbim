import { BehaviorSubject, Observable, Subject } from "rxjs";
import { Scene, Vector2, Vector3, Matrix4, Vector4 } from "three";
import { MarkerInfo } from "../../../common-types";
import { CanvasTextureBuilder } from "../../../helpers/canvas-texture-builder";
import { HudTool } from "./hud-tool";
import { HudInstancedMarkerData, HudInstancedMarker } from "../elements/hud-instanced-marker";

export class HudMarkers extends HudTool { 
  markersChange$: Observable<MarkerInfo[]>;
  markersSelectionChange$: Observable<MarkerInfo[]>;
  markersManualSelectionChange$: Observable<MarkerInfo[]>;
  markersHighlightChange$: Observable<MarkerInfo>;

  private readonly _spriteSize = 16;

  private _uvMap: Map<string, Vector4>;

  private _markersChange: BehaviorSubject<MarkerInfo[]>;  
  private _markersSelectionChange: BehaviorSubject<MarkerInfo[]>;
  private _markersManualSelectionChange: BehaviorSubject<MarkerInfo[]>;
  private _markersHighlightChange: Subject<MarkerInfo>;
  
  private _markers: MarkerInfo[] = [];  
  private _highlightedMarker: MarkerInfo;
  private _selectedMarkerIds = new Set<string>();  

  private _tempVec3 = new Vector3();
  private _tempVec2 = new Vector2();

  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4, 
    toolZIndex: number, cameraZIndex: number) { 
    super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex);

    this._markersChange = new BehaviorSubject<MarkerInfo[]>([]);
    this._markersSelectionChange = new BehaviorSubject<MarkerInfo[]>([]);
    this._markersManualSelectionChange = new BehaviorSubject<MarkerInfo[]>([]);
    this._markersHighlightChange = new Subject<MarkerInfo>();

    this._subjects.push(this._markersChange, this._markersSelectionChange, 
      this._markersManualSelectionChange, this._markersHighlightChange);  

    this.markersChange$ = this._markersChange.asObservable();
    this.markersSelectionChange$ = this._markersSelectionChange.asObservable();
    this.markersManualSelectionChange$ = this._markersManualSelectionChange.asObservable();
    this.markersHighlightChange$ = this._markersHighlightChange.asObservable();

    this.initSprites();
  }

  addMarker(marker: MarkerInfo) {
    if (!marker) {
      return;
    }
    const found = this._markers.find(x => x.id === marker.id);
    if (!found) {
      this._markers.push(marker);
      this.emitMarkers();
      this.updateSprites();
    }
  }

  removeMarker(markerId: string) {
    if (markerId) {
      this._markers = this._markers.filter(x => x.id !== markerId);
      if (this._selectedMarkerIds.delete(markerId)) {
        this.emitSelected();
      }
      this.emitMarkers();
      this.updateSprites();
    }
  }

  setMarkers(markers: MarkerInfo[]) {
    if (!markers?.length) {
      this.resetMarkers();
      return;
    }
    this._markers = markers;
    if (this._selectedMarkerIds.size) {
      this._selectedMarkerIds.clear();
      this.emitSelected();
    }
    this.emitMarkers();
    this.updateSprites();
  }

  resetMarkers() {
    if (this._selectedMarkerIds.size) {      
      this._selectedMarkerIds.clear();
      this.emitSelected();
    }
    if (this._markers.length) {
      this._markers.length = 0;
      this.emitMarkers();
    }
    this.updateSprites();
  }

  highlightMarker(marker: MarkerInfo) {
    if (marker === this._highlightedMarker) {
      return;
    }

    this._highlightedMarker = marker;
    this.emitHighlighted();
    this.updateSprites();
  }

  addMarkerToSelection(markerId: string) {
    if (!this._selectedMarkerIds.has(markerId)) {
      this._selectedMarkerIds.add(markerId);
      this.updateSprites();
      this.emitSelected(true);
    }
  }

  removeMarkerFromSelection(markerId: string) {
    if (this._selectedMarkerIds.delete(markerId)) {
      this.updateSprites();
      this.emitSelected(true);
    }
  }

  setSelectedMarkers(markerIds: string[], manual: boolean) {
    this._selectedMarkerIds.clear();
    if (markerIds?.length) {  
      markerIds.forEach(x => this._selectedMarkerIds.add(x));
    }
    this.updateSprites();
    if (manual) {
      this.emitSelected(manual);
    }
  }

  resetSelectedMarkers() {   
    if (this._selectedMarkerIds.size) {
      this._selectedMarkerIds.clear();
      this.updateSprites();
      this.emitSelected();
    } 
  }

  getMarkerAtCanvasPoint(canvasPositionZeroCenter: Vector2): MarkerInfo {
    if (this._markers.length) {
      const maxDistance = this._spriteSize / 2;
      
      // for (const warning of [...this._warnings.values()].reverse()) {      
      for (let i = this._markers.length - 1; i >= 0; i--) {      
        const marker = this._markers[i];
        this._tempVec3.set(marker.position.x, marker.position.y_Yup, marker.position.z_Yup)
          .applyMatrix4(this._hudProjectionMatrix);
        if (this._tempVec3.z > 1) {
          continue;
        }
        this._tempVec2.set(this._tempVec3.x, this._tempVec3.y);
        if (this._tempVec2.distanceTo(canvasPositionZeroCenter) < maxDistance){
          return marker;
        }
      }
    }
    return null;
  }

  private initSprites() {
    const {texture, uvMap} =  CanvasTextureBuilder.buildSpriteAtlasTexture();
    this._uvMap = uvMap;
    this.addHudElement(new HudInstancedMarker(this._hudProjectionMatrix, this._hudResolution,
      texture, this._spriteSize, this._toolZIndex, this._cameraZIndex, true, 1000), "s_warn");
  }  

  private updateSprites() {
    this._markers.sort((a, b) => { 
      if (a.type === b.type) {
        return 0;
      } else if (a.type > b.type) {
        return 1;
      } else {
        return -1;
      }
    });

    const instanceData: HudInstancedMarkerData[] = new Array(this._markers.length);
    let i = 0;
    this._markers.forEach(v => {
      instanceData[i++] = {
        position: v.position,
        scale: this._highlightedMarker === v 
          ? 1.5 
          : 1,
        uv: this._uvMap.get(this._selectedMarkerIds.has(v.id) ? v.type + "_selected" : v.type),
      };
    });
    this.getHudElement("s_warn").set(instanceData);
  }

  private emitMarkers() {
    this._markersChange.next(this._markers);
  }
  
  private emitHighlighted() {
    this._markersHighlightChange.next(this._highlightedMarker);
  }

  private emitSelected(manual = false) {
    const selectedMarkers = this._markers.filter(x => this._selectedMarkerIds.has(x.id));    
    this._markersSelectionChange.next(selectedMarkers);
    if (manual) {
      this._markersManualSelectionChange.next(selectedMarkers);
    }
  }
}
