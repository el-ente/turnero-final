1. mkdir turnero-final && cd turnero-final

2. git init

3. pnpm init

4. configurar pnpm workspaces
   - crear `pnpm-workspace.yaml`

   ```yaml
   packages:
     - app
     - functions
     - shared
   ```

5. En el package.json raíz agregar:

   ```json
   {
     "private": true
   }
   ```

6. inicializar firebase
   - firebase login
   - firebase init
     - seleccionar Hosting, Firestore, Functions, Storage, Authentication
     - directorio publico: `app/dist`
     - para Functions, dejar que cree la carpeta `functions/`

7. crear app react

   ```bash
       pnpm create vite app --template react-ts
   ```

8. Crear el paquete shared

   ```bash
   mkdir shared && cd shared
   pnpm init
   ```

9. Instalar todo

   ```bash
       pnpm install # (desde la raiz del proyecto)
   ```
