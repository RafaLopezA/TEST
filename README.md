# Team Hub

Aplicación web (sin build ni dependencias) para gestionar el equipo: organigrama, miembros, chapters, grados, vacantes (TBH) y reportes.

## Uso
Abre `index.html` en el navegador. Los datos se guardan en `localStorage` (no salen del navegador).

- **Resumen**: KPIs, personas por chapter / grado / equipo, pipeline de vacantes.
- **Organigrama**: diagrama por director (estilo presentación, vacantes punteadas con SAP) o árbol desplegable. *Exportar PDF* → una página horizontal por director.
- **Miembros**: búsqueda, filtros (chapter, grado, equipo, tipo), alta/edición/borrado, export CSV.
- **Chapters / Grados**: CRUD (no se puede borrar uno en uso).
- **Reportes**: matrices chapter×grado y equipo×chapter, pirámide de grados, % M3+, vacantes por estado, ubicaciones, span of control; CSV e Imprimir/PDF.
- **Importar**: Excel/CSV con las columnas de `peopleTemp.xlsx` (Name, Mail, Manager, Team, Title, Grade (Level), Chapter, Country, City, HiringStatus, PRF number, SAP position number, Comments) o el JSON exportado. Las filas `TBH…` se tratan como vacantes. Importar Excel carga SheetJS desde cdnjs.

Los datos iniciales son de demostración (ficticios).
