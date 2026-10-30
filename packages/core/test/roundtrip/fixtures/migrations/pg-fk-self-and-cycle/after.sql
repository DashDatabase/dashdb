CREATE TABLE employees (id int PRIMARY KEY, manager_id int REFERENCES employees (id), department_id int);
CREATE TABLE departments (id int PRIMARY KEY, head_id int REFERENCES employees (id));
ALTER TABLE employees ADD CONSTRAINT employees_department_fk FOREIGN KEY (department_id) REFERENCES departments (id);
