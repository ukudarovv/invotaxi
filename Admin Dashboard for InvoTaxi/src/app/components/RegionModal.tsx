import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Region, City, CreateRegionData, UpdateRegionData } from "../services/regions";
import { regionsApi } from "../services/regions";
import { MapCoordinatePicker } from "./MapCoordinatePicker";

interface RegionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  region?: Region | null;
  onSuccess: () => void;
}

export function RegionModal({ open, onOpenChange, region, onSuccess }: RegionModalProps) {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usePolygon, setUsePolygon] = useState(false);
  
  const [formData, setFormData] = useState({
    id: "",
    title: "",
    city_id: "",
    center_lat: "",
    center_lon: "",
    polygon_coordinates: [] as number[][],
    service_radius_meters: "",
  });

  const [mapLat, setMapLat] = useState(43.238949);
  const [mapLon, setMapLon] = useState(76.945833);

  // Загрузка городов при открытии модального окна
  useEffect(() => {
    if (open) {
      loadCities();
      if (region) {
        // Редактирование существующего региона
        const hasPolygon = region.polygon_coordinates && region.polygon_coordinates.length > 0;
        setUsePolygon(hasPolygon);
        setFormData({
          id: region.id,
          title: region.title,
          city_id: region.city.id,
          center_lat: region.center_lat.toString(),
          center_lon: region.center_lon.toString(),
          polygon_coordinates: region.polygon_coordinates || [],
          service_radius_meters: region.service_radius_meters?.toString() || "",
        });
        setMapLat(region.center_lat);
        setMapLon(region.center_lon);
      } else {
        // Создание нового региона
        setUsePolygon(false);
        setFormData({
          id: "",
          title: "",
          city_id: "",
          center_lat: "",
          center_lon: "",
          polygon_coordinates: [],
          service_radius_meters: "",
        });
        setMapLat(43.238949);
        setMapLon(76.945833);
      }
      setError(null);
    }
  }, [open, region]);

  const loadCities = async () => {
    setLoadingCities(true);
    try {
      const citiesData = await regionsApi.getCities();
      setCities(citiesData);
    } catch (err) {
      setError("Не удалось загрузить список городов");
    } finally {
      setLoadingCities(false);
    }
  };

  const handleMapCoordinateChange = (lat: number, lon: number) => {
    setMapLat(lat);
    setMapLon(lon);
    setFormData({
      ...formData,
      center_lat: lat.toString(),
      center_lon: lon.toString(),
    });
  };

  const handlePolygonChange = (coordinates: number[][]) => {
    setFormData({
      ...formData,
      polygon_coordinates: coordinates,
    });
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      setError("Название региона обязательно");
      return false;
    }
    if (!formData.city_id) {
      setError("Необходимо выбрать город");
      return false;
    }
    
    if (usePolygon) {
      if (formData.polygon_coordinates.length < 3) {
        setError("Полигон должен содержать минимум 3 точки");
        return false;
      }
    } else {
      const lat = parseFloat(formData.center_lat);
      const lon = parseFloat(formData.center_lon);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        setError("Широта должна быть числом от -90 до 90");
        return false;
      }
      if (isNaN(lon) || lon < -180 || lon > 180) {
        setError("Долгота должна быть числом от -180 до 180");
        return false;
      }
    }

    if (formData.service_radius_meters) {
      const radius = parseFloat(formData.service_radius_meters);
      if (isNaN(radius) || radius <= 0) {
        setError("Радиус обслуживания должен быть положительным числом");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const updateData: UpdateRegionData = {
        title: formData.title,
        city_id: formData.city_id,
      };

      if (usePolygon) {
        updateData.polygon_coordinates = formData.polygon_coordinates.length >= 3 
          ? formData.polygon_coordinates 
          : undefined;
        // Для полигона используем центр полигона как center_lat/lon
        if (formData.polygon_coordinates.length > 0) {
          const avgLat = formData.polygon_coordinates.reduce((sum, p) => sum + p[0], 0) / formData.polygon_coordinates.length;
          const avgLon = formData.polygon_coordinates.reduce((sum, p) => sum + p[1], 0) / formData.polygon_coordinates.length;
          updateData.center_lat = avgLat;
          updateData.center_lon = avgLon;
        }
      } else {
        const lat = parseFloat(formData.center_lat);
        const lon = parseFloat(formData.center_lon);
        updateData.center_lat = lat;
        updateData.center_lon = lon;
      }

      if (formData.service_radius_meters) {
        updateData.service_radius_meters = parseFloat(formData.service_radius_meters);
      }

      if (region) {
        // Обновление региона
        await regionsApi.updateRegion(region.id, updateData);
      } else {
        // Создание региона
        const createData: CreateRegionData = {
          id: formData.id || undefined,
          ...updateData,
        } as CreateRegionData;
        await regionsApi.createRegion(createData);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при сохранении региона");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {region ? "Редактировать регион" : "Добавить регион"}
          </DialogTitle>
          <DialogDescription>
            {region
              ? "Измените данные региона"
              : "Заполните форму для создания нового региона"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!region && (
              <div className="space-y-2">
                <Label htmlFor="id">ID региона (опционально)</Label>
                <Input
                  id="id"
                  placeholder="RG001"
                  value={formData.id}
                  onChange={(e) =>
                    setFormData({ ...formData, id: e.target.value })
                  }
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Если не указано, будет сгенерировано автоматически
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">
                Название региона <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="Алматы"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city_id">
                Город <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.city_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, city_id: value })
                }
                disabled={loading || loadingCities}
              >
                <SelectTrigger id="city_id">
                  <SelectValue placeholder="Выберите город" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="use_polygon">
                  Использовать полигон границ
                </Label>
                <Switch
                  id="use_polygon"
                  checked={usePolygon}
                  onCheckedChange={setUsePolygon}
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {usePolygon
                  ? "Режим рисования полигона. Кликните на карте, чтобы добавить точки границы региона."
                  : "Режим выбора точки центра. Кликните на карте или перетащите маркер."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                {usePolygon ? "Границы региона (полигон)" : "Координаты центра"} <span className="text-red-500">*</span>
              </Label>
              <MapCoordinatePicker
                initialLat={mapLat}
                initialLon={mapLon}
                initialPolygon={formData.polygon_coordinates.length > 0 ? formData.polygon_coordinates : undefined}
                polygonMode={usePolygon}
                onCoordinateChange={handleMapCoordinateChange}
                onPolygonChange={handlePolygonChange}
                serviceRadius={formData.service_radius_meters ? parseFloat(formData.service_radius_meters) : undefined}
                height="300px"
              />
            </div>

            {!usePolygon && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="center_lat">
                    Широта <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="center_lat"
                    type="number"
                    step="any"
                    placeholder="43.2220"
                    value={formData.center_lat}
                    onChange={(e) =>
                      setFormData({ ...formData, center_lat: e.target.value })
                    }
                    onBlur={() => {
                      const lat = parseFloat(formData.center_lat);
                      if (!isNaN(lat)) {
                        setMapLat(lat);
                      }
                    }}
                    required
                    disabled={loading}
                    min="-90"
                    max="90"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="center_lon">
                    Долгота <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="center_lon"
                    type="number"
                    step="any"
                    placeholder="76.8512"
                    value={formData.center_lon}
                    onChange={(e) =>
                      setFormData({ ...formData, center_lon: e.target.value })
                    }
                    onBlur={() => {
                      const lon = parseFloat(formData.center_lon);
                      if (!isNaN(lon)) {
                        setMapLon(lon);
                      }
                    }}
                    required
                    disabled={loading}
                    min="-180"
                    max="180"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="service_radius_meters">
                Радиус обслуживания (метры) (опционально)
              </Label>
              <Input
                id="service_radius_meters"
                type="number"
                step="any"
                placeholder="10000"
                value={formData.service_radius_meters}
                onChange={(e) =>
                  setFormData({ ...formData, service_radius_meters: e.target.value })
                }
                disabled={loading}
                min="0"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Радиус обслуживания от центра региона в метрах. Будет отображаться на карте как круг.
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading || loadingCities}>
              {loading ? "Сохранение..." : region ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

