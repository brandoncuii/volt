import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CARS, CUSTOM_CAR_ID, carsByManufacturer } from '@/lib/cars';

interface Props {
  value: string;
  onChange: (carId: string) => void;
}

export function CarSelector({ value, onChange }: Props) {
  const groups = carsByManufacturer();

  return (
    <div className="space-y-2">
      <Label htmlFor="car">Car</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="car" className="w-full">
          <SelectValue placeholder="Pick a car" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CUSTOM_CAR_ID}>Custom range</SelectItem>
          <SelectSeparator />
          {groups.map(({ manufacturer, cars }) => (
            <SelectGroup key={manufacturer}>
              <SelectLabel>{manufacturer}</SelectLabel>
              {cars.map((car) => (
                <SelectItem key={car.id} value={car.id}>
                  {car.model}{' '}
                  <span className="text-muted-foreground">
                    · {car.rangeMi} mi
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Re-export so callers don't need a second import to seed default state.
export { CARS };
