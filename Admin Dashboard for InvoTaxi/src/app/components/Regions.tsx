import { useState, useEffect } from "react";
import { MapPin, Plus, Edit, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Region, RegionStats, regionsApi } from "../services/regions";
import { RegionModal } from "./RegionModal";
import { Cities } from "./Cities";
import { RegionsMapView } from "./RegionsMapView";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { toast } from "sonner";

interface RegionWithStats extends Region {
  stats?: RegionStats;
}

export function Regions() {
  const [regions, setRegions] = useState<RegionWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [regionToDelete, setRegionToDelete] = useState<Region | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingStats, setLoadingStats] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRegions();
  }, []);

  const loadRegions = async () => {
    setLoading(true);
    setError(null);
    try {
      const regionsData = await regionsApi.getRegions();
      setRegions(regionsData);
      
      // Загружаем статистику для каждого региона
      loadStatsForRegions(regionsData);
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить регионы");
      toast.error("Ошибка загрузки регионов");
    } finally {
      setLoading(false);
    }
  };

  const loadStatsForRegions = async (regionsList: Region[]) => {
    for (const region of regionsList) {
      setLoadingStats((prev) => new Set(prev).add(region.id));
      try {
        const stats = await regionsApi.getRegionStats(region.id);
        setRegions((prev) =>
          prev.map((r) => (r.id === region.id ? { ...r, stats } : r))
        );
      } catch (err) {
        // Игнорируем ошибки статистики, не критично
        console.error(`Failed to load stats for region ${region.id}:`, err);
      } finally {
        setLoadingStats((prev) => {
          const next = new Set(prev);
          next.delete(region.id);
          return next;
        });
      }
    }
  };

  const handleAddClick = () => {
    setEditingRegion(null);
    setModalOpen(true);
  };

  const handleEditClick = (region: Region) => {
    setEditingRegion(region);
    setModalOpen(true);
  };

  const handleDeleteClick = (region: Region) => {
    setRegionToDelete(region);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!regionToDelete) return;

    setDeleting(true);
    try {
      await regionsApi.deleteRegion(regionToDelete.id);
      toast.success(`Регион "${regionToDelete.title}" успешно удален`);
      setRegions((prev) => prev.filter((r) => r.id !== regionToDelete.id));
      setDeleteDialogOpen(false);
      setRegionToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Не удалось удалить регион");
    } finally {
      setDeleting(false);
    }
  };

  const handleModalSuccess = () => {
    loadRegions();
    toast.success(
      editingRegion
        ? "Регион успешно обновлен"
        : "Регион успешно создан"
    );
  };

  // Вычисляем общую статистику
  const totalStats = regions.reduce(
    (acc, region) => {
      if (region.stats) {
        acc.drivers += region.stats.drivers;
        acc.passengers += region.stats.passengers;
        acc.activeOrders += region.stats.active_orders;
        acc.totalOrders += region.stats.total_orders;
      }
      return acc;
    },
    { drivers: 0, passengers: 0, activeOrders: 0, totalOrders: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-gray-900 dark:text-white">
            Управление регионами
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Просмотр и настройка регионов обслуживания
          </p>
        </div>
      </div>

      <Tabs defaultValue="regions" className="w-full">
        <TabsList>
          <TabsTrigger value="regions">Регионы</TabsTrigger>
          <TabsTrigger value="cities">Города</TabsTrigger>
          <TabsTrigger value="map">Карта</TabsTrigger>
        </TabsList>

        <TabsContent value="regions" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl text-gray-900 dark:text-white">
                Управление регионами
              </h2>
            </div>
            <Button
              onClick={handleAddClick}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Добавить регион
            </Button>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-medium">
                  Ошибка загрузки
                </p>
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Всего регионов
              </p>
              <p className="text-3xl mt-2 text-gray-900 dark:text-white">
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  regions.length
                )}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Всего водителей
              </p>
              <p className="text-3xl mt-2 text-gray-900 dark:text-white">
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  totalStats.drivers
                )}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Всего пассажиров
              </p>
              <p className="text-3xl mt-2 text-gray-900 dark:text-white">
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  totalStats.passengers
                )}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Активные заказы
              </p>
              <p className="text-3xl mt-2 text-gray-900 dark:text-white">
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  totalStats.activeOrders
                )}
              </p>
            </div>
          </div>

          {/* Loading State */}
          {loading && regions.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="ml-3 text-gray-600 dark:text-gray-400">
                Загрузка регионов...
              </span>
            </div>
          )}

          {/* Empty State */}
          {!loading && regions.length === 0 && !error && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
              <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Нет регионов
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Создайте первый регион для начала работы
              </p>
              <Button onClick={handleAddClick} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-5 h-5 mr-2" />
                Добавить регион
              </Button>
            </div>
          )}

          {/* Regions Table */}
          {!loading && regions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Название
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Город
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Координаты
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Радиус/Полигон
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Водители
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Пассажиры
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Заказы
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {regions.map((region) => (
                      <tr
                        key={region.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {region.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-600" />
                            {region.title}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {region.city.title}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          <div>
                            <div>{region.center.lat.toFixed(4)}, {region.center.lon.toFixed(4)}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {region.service_radius_meters ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                              Радиус: {region.service_radius_meters}м
                            </span>
                          ) : region.polygon_coordinates && region.polygon_coordinates.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                              Полигон: {region.polygon_coordinates.length} точек
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {loadingStats.has(region.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            region.stats?.drivers ?? "-"
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {loadingStats.has(region.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            region.stats?.passengers ?? "-"
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {loadingStats.has(region.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <div>
                              <div className="text-blue-600">{region.stats?.active_orders ?? 0}</div>
                              <div className="text-xs text-gray-500">из {region.stats?.total_orders ?? 0}</div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditClick(region)}
                              className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                              title="Редактировать"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(region)}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              title="Удалить"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cities" className="mt-6">
          <Cities />
        </TabsContent>

        <TabsContent value="map" className="mt-6">
          <RegionsMapView regions={regions} onRegionClick={handleEditClick} />
        </TabsContent>
      </Tabs>

      {/* Region Modal */}
      <RegionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        region={editingRegion}
        onSuccess={handleModalSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить регион "{regionToDelete?.title}"?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}