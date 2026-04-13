package com.example.redex_expensetracker

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

data class AppItem(val name: String, val packageName: String, var isChecked: Boolean)

class WhitelistAdapter(private val apps: List<AppItem>) : RecyclerView.Adapter<WhitelistAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val appName: TextView = view.findViewById(android.R.id.text1)
        val checkBox: CheckBox = view.findViewById(android.R.id.checkbox)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(android.R.layout.simple_list_item_multiple_choice, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val app = apps[position]
        holder.appName.text = app.name
        holder.checkBox.isChecked = app.isChecked
        holder.checkBox.setOnCheckedChangeListener { _, isChecked ->
            app.isChecked = isChecked
        }
    }

    override fun getItemCount() = apps.size
}
