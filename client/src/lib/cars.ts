// Curated catalog of popular EVs with EPA-rated highway range.
// Numbers reflect the most common configuration of model year 2024–2025
// (the variant most likely to be encountered on the road right now).
// EPA ratings shift slightly between model years and after OTA software
// updates — recheck before relying on these for anything beyond UX seeding.
//
// Order within a manufacturer: longest-range variant first.

export interface Car {
  id: string;
  manufacturer: string;
  model: string;
  rangeMi: number;
}

export const CARS: Car[] = [
  // Tesla
  { id: 'tesla-model-s-lr', manufacturer: 'Tesla', model: 'Model S Long Range', rangeMi: 405 },
  { id: 'tesla-model-3-lr', manufacturer: 'Tesla', model: 'Model 3 Long Range AWD', rangeMi: 363 },
  { id: 'tesla-model-s-plaid', manufacturer: 'Tesla', model: 'Model S Plaid', rangeMi: 359 },
  { id: 'tesla-model-x-lr', manufacturer: 'Tesla', model: 'Model X Long Range', rangeMi: 348 },
  { id: 'tesla-cybertruck-awd', manufacturer: 'Tesla', model: 'Cybertruck AWD', rangeMi: 340 },
  { id: 'tesla-model-y-lr', manufacturer: 'Tesla', model: 'Model Y Long Range AWD', rangeMi: 320 },
  { id: 'tesla-model-3-perf', manufacturer: 'Tesla', model: 'Model 3 Performance', rangeMi: 296 },
  { id: 'tesla-model-y-perf', manufacturer: 'Tesla', model: 'Model Y Performance', rangeMi: 285 },

  // Rivian
  { id: 'rivian-r1t-large', manufacturer: 'Rivian', model: 'R1T Dual Motor Large Pack', rangeMi: 352 },
  { id: 'rivian-r1s-large', manufacturer: 'Rivian', model: 'R1S Dual Motor Large Pack', rangeMi: 321 },

  // Lucid
  { id: 'lucid-air-gt', manufacturer: 'Lucid', model: 'Air Grand Touring', rangeMi: 516 },
  { id: 'lucid-air-pure', manufacturer: 'Lucid', model: 'Air Pure RWD', rangeMi: 419 },

  // Ford
  { id: 'ford-f150-lightning-er', manufacturer: 'Ford', model: 'F-150 Lightning Extended Range', rangeMi: 320 },
  { id: 'ford-mach-e-er-rwd', manufacturer: 'Ford', model: 'Mustang Mach-E ER RWD', rangeMi: 320 },

  // Hyundai
  { id: 'hyundai-ioniq-6-lr-rwd', manufacturer: 'Hyundai', model: 'Ioniq 6 Long Range RWD', rangeMi: 361 },
  { id: 'hyundai-ioniq-5-lr-rwd', manufacturer: 'Hyundai', model: 'Ioniq 5 Long Range RWD', rangeMi: 303 },

  // Kia
  { id: 'kia-ev6-wind-rwd', manufacturer: 'Kia', model: 'EV6 Wind RWD', rangeMi: 310 },
  { id: 'kia-ev9-light-rwd', manufacturer: 'Kia', model: 'EV9 Light RWD', rangeMi: 304 },

  // Chevrolet
  { id: 'chevy-silverado-ev-rst', manufacturer: 'Chevrolet', model: 'Silverado EV RST', rangeMi: 440 },
  { id: 'chevy-equinox-ev-lt-fwd', manufacturer: 'Chevrolet', model: 'Equinox EV LT FWD', rangeMi: 319 },

  // Volkswagen
  { id: 'vw-id4-pro-s-rwd', manufacturer: 'Volkswagen', model: 'ID.4 Pro S RWD', rangeMi: 291 },

  // Polestar
  { id: 'polestar-2-lr-sm', manufacturer: 'Polestar', model: '2 Long Range Single Motor', rangeMi: 320 },
];

export const CUSTOM_CAR_ID = 'custom';

export function findCar(id: string): Car | undefined {
  if (id === CUSTOM_CAR_ID) return undefined;
  return CARS.find((c) => c.id === id);
}

export function carsByManufacturer(): { manufacturer: string; cars: Car[] }[] {
  const map = new Map<string, Car[]>();
  for (const car of CARS) {
    const list = map.get(car.manufacturer) ?? [];
    list.push(car);
    map.set(car.manufacturer, list);
  }
  return Array.from(map, ([manufacturer, cars]) => ({ manufacturer, cars }));
}
