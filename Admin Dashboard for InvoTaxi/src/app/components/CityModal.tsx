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
import { Label } from "./ui/label";
import { City, CreateCityData, UpdateCityData } from "../services/regions";
import { regionsApi } from "../services/regions";
import { MapCoordinatePicker } from "./MapCoordinatePicker";

interface CityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city?: City | null;
  onSuccess: () => void;
}

export function CityModal({ open, onOpenChange, city, onSuccess }: CityModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    id: "",
    title: "",
    center_lat: "",
    center_lon: "",
  });

  const [mapLat, setMapLat] = useState(43.238949);
  const [mapLon, setMapLon] = useState(76.945833);

  // Загрузка данных города при открытии модального окна
  useEffect(() => {
    if (open) {
      if (city) {
        // Редактирование существующего города
        setFormData({
          id: city.id,
          title: city.title,
          center_lat: city.center_lat.toString(),
          center_lon: city.center_lon.toString(),
        });
        setMapLat(city.center_lat);
        setMapLon(city.center_lon);
      } else {
        // Создание нового города
        setFormData({
          id: "",
          title: "",
          center_lat: "",
          center_lon: "",
        });
        setMapLat(43.238949);
        setMapLon(76.945833);
      }
      setError(null);
    }
  }, [open, city]);

  const handleMapCoordinateChange = (lat: number, lon: number) => {
    setMapLat(lat);
    setMapLon(lon);
    setFormData({
      ...formData,
      center_lat: lat.toString(),
      center_lon: lon.toString(),
    });
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      setError("Название города обязательно");
      return false;
    }
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
      const lat = parseFloat(formData.center_lat);
      const lon = parseFloat(formData.center_lon);

      if (city) {
        // Обновление города
        const updateData: UpdateCityData = {
          title: formData.title,
          center_lat: lat,
          center_lon: lon,
        };
        await regionsApi.updateCity(city.id, updateData);
      } else {
        // Создание города
        const createData: CreateCityData = {
          id: formData.id || undefined,
          title: formData.title,
          center_lat: lat,
          center_lon: lon,
        };
        await regionsApi.createCity(createData);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при сохранении города");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {city ? "Редактировать город" : "Добавить город"}
          </DialogTitle>
          <DialogDescription>
            {city
              ? "Измените данные города"
              : "Заполните форму для создания нового города"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!city && (
              <div className="space-y-2">
                <Label htmlFor="id">ID города (опционально)</Label>
                <Input
                  id="id"
                  placeholder="CT001"
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
                Название города <span className="text-red-500">*</span>
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
              <Label>
                Координаты центра <span className="text-red-500">*</span>
              </Label>
              <MapCoordinatePicker
                initialLat={mapLat}
                initialLon={mapLon}
                onCoordinateChange={handleMapCoordinateChange}
                height="300px"
              />
            </div>

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
            <Button type="submit" disabled={loading}>
              {loading ? "Сохранение..." : city ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

