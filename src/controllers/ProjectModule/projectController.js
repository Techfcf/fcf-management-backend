// controllers/projectController.js
const pool = require("../../config/db");

// CREATE
const createProject = async (req, res) => {
  const {
    project_code,
    project_name,
    project_category,
    status_of_project,
    client_name,
    project_start_date,
    project_location,
    vcs_gs_or_other_id,
    project_notes,
    officer_in_charge,
    created_by
  } = req.body;

  if (!project_code || !project_name) {
    return res.status(400).json({ error: 'project_code and project_name are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO public.projects
        (project_code, project_name, project_category, status_of_project, client_name,
         project_start_date, project_location, vcs_gs_or_other_id, project_notes,
         officer_in_charge, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       RETURNING *`,
      [
        project_code, project_name, project_category, status_of_project, client_name,
        project_start_date, project_location, vcs_gs_or_other_id, project_notes,
        officer_in_charge, created_by
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'project_code already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

// GET ALL (with optional pagination & is_active filter)
const getProjects = async (req, res) => {
  const { page = 1, limit = 20, is_active } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT * FROM public.projects`;
    const params = [];

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      query += ` WHERE is_active = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// GET ONE
const getProjectByCode = async (req, res) => {
  const { project_code } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.projects WHERE project_code = $1`,
      [project_code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

// UPDATE
const updateProject = async (req, res) => {
  const { project_code } = req.params;
  const updatableFields = [
    'project_name', 'project_category', 'status_of_project', 'client_name',
    'project_start_date', 'project_location', 'vcs_gs_or_other_id',
    'project_notes', 'officer_in_charge', 'updated_by', 'is_active'
  ];

  const fieldsToUpdate = Object.keys(req.body).filter(key => updatableFields.includes(key));

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided to update' });
  }

  const setClause = fieldsToUpdate
    .map((field, idx) => `${field} = $${idx + 1}`)
    .join(', ');
  const values = fieldsToUpdate.map(field => req.body[field]);

  try {
    const result = await pool.query(
      `UPDATE public.projects
       SET ${setClause}, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
       WHERE project_code = $${fieldsToUpdate.length + 1}
       RETURNING *`,
      [...values, project_code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectByCode,
  updateProject
};