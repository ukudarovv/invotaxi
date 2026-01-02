import { useState, useEffect } from "react";
import { MapPin, Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { regionsApi, Region } from "../services/regions";
import { RegionsMap } from "./RegionsMap";

export function Regions() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  useEffect(() => {
    const loadRegions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await regionsApi.getRegions();
        // Убеждаемся, что data является массивом
        if (Array.isArray(data)) {
          setRegions(data);
        } else {
          // Если API возвращает объект с пагинацией
          setRegions(data.results || []);
        }
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки регионов");
        setRegions([]); // Устанавливаем пустой массив при ошибке
      } finally {
        setLoading(false);
      }
    };
    loadRegions();
  }, []);

  const handleRegionClick = (regionId: string) => {
    setSelectedRegionId(regionId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-gray-900 dark:text-white">Управление регионами</h1>
          <p className="text-gray-600 dark:text-gray-400">Просмотр и настройка регионов обслуживания</p>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700">
          <Plus className="w-5 h-5" />
          Добавить регион
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Всего регионов</p>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">{loading ? "..." : regions.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Регионов</p>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">{loading ? "..." : regions.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Регионов</p>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">{loading ? "..." : regions.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Регионов</p>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">{loading ? "..." : regions.length}</p>
        </div>
      </div>

      {/* Regions Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Загрузка регионов...</span>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {!Array.isArray(regions) || regions.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
              Регионы не найдены
            </div>
          ) : (
            regions.map((region) => (
          <div key={region.id} className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                      <h3 className="text-xl text-gray-900 dark:text-white">{region.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{region.city?.title || 'Город не указан'}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{region.id}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  <Edit className="w-5 h-5" />
                </button>
                <button className="text-red-600 hover:text-red-800">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Координаты центра</p>
              <p className="text-sm mt-1 text-gray-900 dark:text-gray-100">
                    {region.center_lat.toFixed(4)}, {region.center_lon.toFixed(4)}
              </p>
            </div>

                <button
                  onClick={() => handleRegionClick(region.id)}
                  className="w-full mt-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
              Просмотреть на карте
            </button>
          </div>
            ))
          )}
      </div>
      )}

      {/* Map */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Карта регионов</h2>
        <div className="w-full h-96 rounded-lg overflow-hidden">
          {loading ? (
            <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>Загрузка карты...</p>
              </div>
          </div>
          ) : (
            <RegionsMap
              regions={regions}
              selectedRegionId={selectedRegionId}
              onRegionSelect={handleRegionClick}
              defaultZoom={10}
              serviceRadius={10000}
            />
          )}
        </div>
      </div>
    </div>
  );
}