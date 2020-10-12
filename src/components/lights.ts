import { Light, AmbientLight, HemisphereLight, DirectionalLight } from "three";

export class Lights {
  private _ambientLight: AmbientLight;
  private _hemisphereLight: HemisphereLight;
  private _directionalLight: DirectionalLight;
  
  constructor(physicalLights: boolean, ambientLightIntensity: number,
    hemiLightIntensity: number, dirLightIntensity: number) {    

    const ambientLight = new AmbientLight(0x222222, 
      physicalLights 
        ? ambientLightIntensity * Math.PI 
        : ambientLightIntensity);
    this._ambientLight = ambientLight;

    const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 
      physicalLights 
        ? hemiLightIntensity * Math.PI 
        : hemiLightIntensity);
    hemiLight.position.set(0, 2000, 0);
    this._hemisphereLight = hemiLight;

    const dirLight = new DirectionalLight(0xffffff,
      physicalLights 
        ? dirLightIntensity * Math.PI 
        : dirLightIntensity);
    dirLight.position.set(-2, 10, 2);
    this._directionalLight = dirLight;
  }

  update(physicalLights: boolean, ambientLightIntensity: number,
    hemiLightIntensity: number, dirLightIntensity: number) {

    this._ambientLight.intensity = physicalLights 
      ? ambientLightIntensity * Math.PI 
      : ambientLightIntensity;
    this._hemisphereLight.intensity = physicalLights 
      ? hemiLightIntensity * Math.PI 
      : hemiLightIntensity;
    this._directionalLight.intensity = physicalLights 
      ? dirLightIntensity * Math.PI 
      : dirLightIntensity;   
  }  

  getLights(): Light[] {
    return [
      this._ambientLight, 
      this._hemisphereLight, 
      this._directionalLight,
    ];
  }

  getCopy(): Light[] {    
    return [
      new AmbientLight().copy(this._ambientLight), 
      new HemisphereLight().copy(this._hemisphereLight), 
      new DirectionalLight().copy(this._directionalLight),
    ];
  }
}
