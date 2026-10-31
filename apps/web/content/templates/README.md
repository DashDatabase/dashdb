# Schema templates

Each `<slug>.dashdb.json` here is a page in the gallery at `/templates/<slug>`. A template is an
ordinary DashDB project file (the editor's **Export → DashDB project**) with a `template` block
at the top describing it. The gallery pages, diagram previews and SQL/Prisma downloads are all
generated from these files at build time.

## Contributing a template

1. **Design the schema in DashDB.** Open the editor, build the schema and arrange the diagram so
   it reads well. Or start from SQL you already have:

   ```sh
   pnpm --filter @dashdb/web template:from-sql schema.sql meta.json my-template
   ```

   `meta.json` is the `template` block below without `tablesCount`; the script lays the tables
   out automatically and writes `content/templates/my-template.dashdb.json`.

2. **Export it** with Export → DashDB project, and save it here as `<slug>.dashdb.json`. The slug
   is the URL: lowercase words joined by hyphens, such as `ride-sharing`.

3. **Describe it** by adding a `template` block next to `"format"`:

   ```json
   "template": {
     "title": "Ride sharing",
     "description": "Riders, drivers, vehicles, trips with fare breakdowns and ratings, for a ride-hailing app. (50 to 170 characters)",
     "tags": ["mobility", "marketplace", "payments"],
     "dialect": "postgres",
     "tablesCount": 8,
     "decisions": [
       { "title": "Why trips copy the fare", "body": "Explain the choice and its trade-off in two or three sentences." }
     ],
     "author": "your-github-username"
   }
   ```

   Remove saved baselines (`"baselines": []`): templates ship without history.

4. **Check it:**

   ```sh
   pnpm --filter @dashdb/web templates:check
   ```

   This validates the file, confirms `tablesCount` and `dialect` match the schema, and renders the
   preview and the SQL and Prisma downloads. CI runs the same check.

5. **Open a pull request** to [DashDatabase/dashdb](https://github.com/DashDatabase/dashdb) with
   the new file and a sentence on what the schema is for.

## What makes a good template

- **A real use case**, not a toy: 5 to 15 tables that an actual product would need.
- **Every table earns its place.** Leave out generic extras (settings, logs) unless they matter to
  the design.
- **3 to 6 design decisions** that explain _why_: the trade-off made, and what to change if the
  reader's needs differ. This is what makes a template worth more than a diagram.
- **Sensible constraints**: primary keys everywhere, foreign keys with deliberate `ON DELETE`
  rules, `NOT NULL` where a value is required, and indexes for the obvious queries.
- **No real data or names** of people or companies.

Templates are distributed under the project's license (FSL-1.1-MIT); by contributing one you agree
to that.
